use crate::states::*;
use anchor_lang::prelude::*;
use anchor_spl::token::Mint;
use anchor_spl::token::{Token, TokenAccount, Transfer};
use delphor_oracle_aggregator::{check_token_position as check_token_aggregator, GlobalAccount};

#[derive(Accounts)]
#[instruction(swap_amount: u64, min_amount: u64, bump: u8, position_sell: u8, position_buy: u8)]
pub struct Swap<'info> {
    #[account(
        seeds = [
            get_admin().as_ref(),
        ], 
        bump = global_state.bump
    )]
    pub global_state: Account<'info, GlobalState>,
    pub delphor_aggregator_prices: Account<'info, GlobalAccount>,
    #[account(mut)]
    pub user_vault: Box<Account<'info, UserVault>>,
    /// CHECK:
    #[account(
        seeds = [
            "store_auth".as_ref()
        ],
        bump = bump,
    )]
    pub token_store_authority: AccountInfo<'info>,
    // token user sends
    pub mint_sell: Account<'info, Mint>,
    // token user wants, validates the tokens being swapped are differents
    #[account(constraint = mint_buy.key() != mint_sell.key())]
    pub mint_buy: Account<'info, Mint>,
    // Account where user have tokens
    #[account(mut, associated_token::mint = mint_sell, associated_token::authority = get_token_from_authority)]
    pub get_token_from: Box<Account<'info, TokenAccount>>,
    // owner or delegate_authority
    pub get_token_from_authority: Signer<'info>,
    // User account to send tokens
    #[account(mut)]
    pub send_token_to: Box<Account<'info, TokenAccount>>,
    // PDA to withdraw tokens
    #[account(mut, associated_token::mint = mint_buy, associated_token::authority = token_store_authority)]
    pub token_store_pda_from: Box<Account<'info, TokenAccount>>,
    // PDA to deposit tokens
    #[account(mut, associated_token::mint = mint_sell, associated_token::authority = token_store_authority)]
    pub token_store_pda_to: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}
impl<'info> Swap<'info> {
    #[access_control(
        check_vault(&self.user_vault.user, &self.user_vault) &&
        check_token_aggregator(&self.delphor_aggregator_prices, &self.mint_sell, position_sell) &&
        check_token_aggregator(&self.delphor_aggregator_prices, &self.mint_buy, position_buy) &&
        check_token_position(&self.global_state, &self.mint_sell, position_sell) &&
        check_token_position(&self.global_state, &self.mint_buy, position_buy)
    )]
    pub fn process(
        &mut self,
        swap_amount: u64,
        min_amount: u64,
        bump: u8,
        position_sell: u8,
        position_buy: u8,
    ) -> Result<()> {
        let sell_coin_price = self.delphor_aggregator_prices.tokens[position_sell as usize].price;
        let sell_coin_decimals = self.delphor_aggregator_prices.tokens[position_sell as usize].decimals;
        let buy_coin_price = self.delphor_aggregator_prices.tokens[position_buy as usize].price;
        let buy_coin_decimals = self.delphor_aggregator_prices.tokens[position_buy as usize].decimals;
        let user_vault_from = &self.user_vault.vaults[position_buy as usize];
        let user_vault_to = &self.user_vault.vaults[position_sell as usize];

        require!(user_vault_from.provide_status, ErrorCode::VaultProvideOff);
        require!(user_vault_to.receive_status, ErrorCode::VaultRecieveOff);
        if user_vault_from.limit_price_status {
            require!(user_vault_from.limit_price < buy_coin_price, ErrorCode::PriceUnderLimitPrice);

        }
        require!(user_vault_to.amount + swap_amount <= user_vault_to.max, ErrorCode::ExceedsMaxAmount);

        let mut buy_fee = 10;
        let mut sell_fee = 10;

        match self.user_vault.vault_type{
            VaultType::LiquidityProvider => {
                buy_fee = user_vault_to.buy_fee;
                sell_fee = user_vault_from.sell_fee;
            }
            VaultType::PortfolioManager {auto_fee: _, tolerance: _}=> {

            }
        }

        let token_price: u128 = (sell_coin_price as u128 * (10000 - buy_fee as u128)
            / 10000)
            * u128::pow(10, buy_coin_decimals as u32)
            / (buy_coin_price as u128 * (10000 + sell_fee as u128) / 10000);
        // Calculate final amount with oracle price and fees
        let amount_to_send: u64 =
            ((swap_amount as u128 * token_price) / u128::pow(10, sell_coin_decimals as u32)) as u64;

        require!(amount_to_send >= min_amount, ErrorCode::InsufficientAmount);    
        require!(user_vault_from.amount >= amount_to_send, ErrorCode::VaultInsufficientAmount);
        require!(user_vault_from.amount - amount_to_send >= user_vault_from.min, ErrorCode::ExceedsMinAmount);

        anchor_spl::token::transfer(
            CpiContext::new(
                self.token_program.to_account_info().clone(),
                Transfer {
                    from: self.get_token_from.to_account_info(),
                    to: self.token_store_pda_to.to_account_info(),
                    authority: self.get_token_from_authority.to_account_info().clone(),
                },
            ),
            swap_amount,
        )?;

        let seeds: &[&[u8]] = &[b"store_auth", &[bump]];
        let signer = &[&seeds[..]];

        anchor_spl::token::transfer(
            CpiContext::new_with_signer(
                self.token_program.to_account_info().clone(),
                Transfer {
                    from: self.token_store_pda_from.to_account_info(),
                    to: self.send_token_to.to_account_info(),
                    authority: self.token_store_authority.to_account_info(),
                },
                signer,
            ),
            amount_to_send,
        )?;

        self.user_vault.vaults[position_sell as usize].amount += swap_amount;
        self.user_vault.vaults[position_buy as usize].amount -= amount_to_send;
        self.user_vault.vaults[position_buy as usize].timestamp = Clock::get().unwrap().unix_timestamp as u32;

        Ok(())
    }
}

// ------------
// -- Errors --
// ------------

#[error_code]
pub enum ErrorCode {
    #[msg("Final amount lower than min_amount.")]
    InsufficientAmount,
    #[msg("Vault insufficient balance.")]
    VaultInsufficientAmount,
    #[msg("Operation exceeds max balance to user_vault_to")]
    ExceedsMaxAmount,
    #[msg("Operation exceeds min balance to user_vault_from")]
    ExceedsMinAmount,
    #[msg("Vault from paused.")]
    VaultProvideOff,
    #[msg("Vault to paused.")]
    VaultRecieveOff,
    #[msg("Current price for token requested is under the vault from limit price.")]
    PriceUnderLimitPrice,
}
