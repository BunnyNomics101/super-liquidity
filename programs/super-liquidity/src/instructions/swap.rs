use crate::states::*;
use anchor_lang::prelude::*;
use std::cmp;
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
    pub user_vault: Account<'info, UserVault>,
    /// CHECK:
    #[account(
        seeds = [
            "store_auth".as_ref()
        ],
        bump = bump,
    )]
    pub token_store_authority: AccountInfo<'info>,
    // Account where user have tokens
    #[account(mut, constraint = get_token_from.mint == token_store_pda_to.mint, constraint = get_token_from.owner == get_token_from_authority.key())]
    pub get_token_from: Box<Account<'info, TokenAccount>>,
    // owner or delegate_authority
    pub get_token_from_authority: Signer<'info>,
    // User account to send tokens
    #[account(mut, constraint = send_token_to.mint == token_store_pda_from.mint)]
    pub send_token_to: Box<Account<'info, TokenAccount>>,
    // PDA to withdraw tokens
    #[account(mut, constraint = token_store_pda_from.owner == token_store_authority.key())]
    pub token_store_pda_from: Box<Account<'info, TokenAccount>>,
    // PDA to deposit tokens
    #[account(mut, constraint = token_store_pda_to.owner == token_store_authority.key(), constraint = token_store_pda_to.mint != token_store_pda_from.mint)]
    pub token_store_pda_to: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}
impl<'info> Swap<'info> {
    #[access_control(
        check_vault(&self.user_vault.user, &self.user_vault) &&
        check_token_aggregator(&self.delphor_aggregator_prices, &self.token_store_pda_to.mint, position_sell) &&
        check_token_aggregator(&self.delphor_aggregator_prices, &self.token_store_pda_from.mint, position_buy) &&
        check_token_position(&self.global_state, &self.token_store_pda_to.mint, position_sell) &&
        check_token_position(&self.global_state, &self.token_store_pda_from.mint, position_buy)
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
        let user_vault_buy = &self.user_vault.vaults[position_buy as usize];
        let user_vault_sell = &self.user_vault.vaults[position_sell as usize];

        require!
        (
            !user_vault_buy.limit_price_status  || 
            user_vault_buy.limit_price < buy_coin_price, 
            ErrorCode::PriceUnderLimitPrice
        );

        let mut usd_value: u64 = 0;
        let tokens_len = self.global_state.tokens.len();

        let mut buy_fee = 0;
        let mut sell_fee = 0;

        match self.user_vault.vault_type{
            VaultType::LiquidityProvider => {
                buy_fee = user_vault_sell.buy_fee;
                sell_fee = user_vault_buy.sell_fee;
            },
            VaultType::PortfolioManager{auto_fee: true, tolerance: _} => {
                for i in 0..tokens_len {
                    if i != position_buy as usize && i != position_sell as usize {
                        usd_value += (self.delphor_aggregator_prices.tokens[i as usize].price as u128 * self.user_vault.vaults[i].amount as u128 / u128::pow(10, self.delphor_aggregator_prices.tokens[i as usize].decimals as u32)) as u64;
                    }
                }

                let buy_token_usd_in_vault = ((buy_coin_price as u128 * user_vault_buy.amount as u128) / u128::pow(10, buy_coin_decimals as u32)) as u64;
                let sell_token_usd_in_vault = ((user_vault_sell.amount as u128  * sell_coin_price as u128)  / u128::pow(10, sell_coin_decimals as u32)) as u64;
                let current_usd_value = usd_value + buy_token_usd_in_vault + sell_token_usd_in_vault;
                let buy_token_current_percentage = (buy_token_usd_in_vault  as u128 * 10000 / current_usd_value as u128) as u64;
                let sell_token_current_percentage = (sell_token_usd_in_vault  as u128 * 10000 / current_usd_value as u128) as u64;

                buy_fee = ((cmp::min(buy_token_current_percentage, user_vault_buy.mid) * 10000 / cmp::max(buy_token_current_percentage, user_vault_buy.mid) * 25 / 10000) + 5) as u16;
                sell_fee = (cmp::min(sell_token_current_percentage, user_vault_sell.mid) * 10000 / cmp::max(sell_token_current_percentage, user_vault_sell.mid) * 25 / 10000 + 5) as u16;
            }
            _ => ()
        }

        let token_price: u128 = (sell_coin_price as u128 * (10000 - sell_fee as u128)
            / 10000)
            * u128::pow(10, buy_coin_decimals as u32)
            / (buy_coin_price as u128 * (10000 + buy_fee as u128) / 10000);
        
        // Calculate final amount with oracle price and fees
        let amount_to_send: u64 =
            ((swap_amount as u128 * token_price) / u128::pow(10, sell_coin_decimals as u32)) as u64;

        require!(amount_to_send >= min_amount, ErrorCode::InsufficientAmount);    
        require!(user_vault_buy.amount >= amount_to_send, ErrorCode::VaultInsufficientAmount);

        match self.user_vault.vault_type{
            VaultType::PortfolioManager {auto_fee: _, tolerance: _}=> {
                let end_buy_usd = (buy_coin_price as u128 * (user_vault_buy.amount - amount_to_send) as u128 / u128::pow(10, buy_coin_decimals as u32)) as u64;
                let end_sell_usd = (sell_coin_price as u128 * (user_vault_sell.amount + swap_amount) as u128 / u128::pow(10, sell_coin_decimals as u32)) as u64;
                usd_value += end_sell_usd + end_buy_usd;
    
                require!(((end_buy_usd * 10000) / usd_value) as u64 >= user_vault_buy.min, ErrorCode::ExceedsMinAmount);
                require!(((end_sell_usd * 10000) / usd_value) as u64  <= user_vault_sell.max, ErrorCode::ExceedsMaxAmount);
            },
            VaultType::LiquidityProvider => {
                require!(user_vault_buy.amount - amount_to_send >= user_vault_buy.min, ErrorCode::ExceedsMinAmount);
                require!(user_vault_sell.amount + swap_amount <= user_vault_sell.max, ErrorCode::ExceedsMaxAmount);
                require!(user_vault_buy.provide_status, ErrorCode::VaultProvideOff);
                require!(user_vault_sell.receive_status, ErrorCode::VaultRecieveOff);
            }
        }

        self.user_vault.vaults[position_sell as usize].amount += swap_amount;
        self.user_vault.vaults[position_buy as usize].amount -= amount_to_send;

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
    #[msg("Operation exceeds max balance to user_vault_sell")]
    ExceedsMaxAmount,
    #[msg("Operation exceeds min balance to user_vault_buy")]
    ExceedsMinAmount,
    #[msg("Vault from paused.")]
    VaultProvideOff,
    #[msg("Vault to paused.")]
    VaultRecieveOff,
    #[msg("Current price for token requested is under the vault from limit price.")]
    PriceUnderLimitPrice,
}
