use crate::states::*;
use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount, Transfer};
use delphor_oracle_aggregator::{check_token_position as check_token_aggregator, GlobalAccount};
use std::cmp;
use std::convert::TryFrom;

const TEN: u128 = 10;
const BASIS_POINTS_128: u128 = 10000;

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
        position_sell: u8, // position token user sells
        position_buy: u8,  // position token user buys
    ) -> Result<()> {
        let pos_buy = position_buy as usize;
        let pos_sell = position_sell as usize;

        let sell_token_price = self.delphor_aggregator_prices.tokens[pos_sell].price as u128;
        let sell_token_decimals = self.delphor_aggregator_prices.tokens[pos_sell].decimals;
        let buy_token_price = self.delphor_aggregator_prices.tokens[pos_buy].price as u128;
        let buy_token_decimals = self.delphor_aggregator_prices.tokens[pos_buy].decimals;
        let user_vault_buy = &self.user_vault.vaults[pos_buy];
        let user_vault_sell = &self.user_vault.vaults[pos_sell];

        let ten_pow_buy_token_decimals = TEN.checked_pow(buy_token_decimals as u32).unwrap();
        let ten_pow_sell_token_decimals = TEN.checked_pow(sell_token_decimals as u32).unwrap();
        let delphor_base_fee = self.global_state.base_fee as u128;

        require!(
            !user_vault_buy.limit_price_status
                || user_vault_buy.limit_price < buy_token_price as u64,
            ErrorCode::PriceUnderLimitPrice
        );

        let mut vault_usd_value: u128 = 0;
        let mut buy_fee: u128 = user_vault_sell.buy_fee.into();
        let mut sell_fee: u128 = user_vault_buy.sell_fee.into();

        match self.user_vault.vault_type {
            VaultType::PortfolioManager {
                auto_fee: true,
                tolerance: _,
            } => {
                let tokens_len = self.global_state.tokens.len();
                for i in 0..tokens_len {
                    let token_price = self.delphor_aggregator_prices.tokens[i].price as u128;
                    let token_amount = self.user_vault.vaults[i].amount as u128;
                    let token_decimals = self.delphor_aggregator_prices.tokens[i].decimals as u32;
                    if i != position_buy as usize && i != position_sell as usize {
                        vault_usd_value +=
                            token_price * token_amount / TEN.checked_pow(token_decimals).unwrap();
                    }
                }
                let buy_token_usd_in_vault =
                    buy_token_price * user_vault_buy.amount as u128 / ten_pow_buy_token_decimals;
                let sell_token_usd_in_vault =
                    user_vault_sell.amount as u128 * sell_token_price / ten_pow_sell_token_decimals;
                let current_vault_usd_value =
                    vault_usd_value as u128 + buy_token_usd_in_vault + sell_token_usd_in_vault;
                let buy_token_current_percentage =
                    buy_token_usd_in_vault * BASIS_POINTS_128 / current_vault_usd_value;
                let sell_token_current_percentage =
                    sell_token_usd_in_vault * BASIS_POINTS_128 / current_vault_usd_value;

                buy_fee = cmp::min(buy_token_current_percentage, user_vault_buy.mid.into())
                    * BASIS_POINTS_128
                    / cmp::max(buy_token_current_percentage, user_vault_buy.mid.into())
                    * 25
                    / BASIS_POINTS_128;
                sell_fee = cmp::min(sell_token_current_percentage, user_vault_sell.mid.into())
                    * BASIS_POINTS_128
                    / cmp::max(sell_token_current_percentage, user_vault_sell.mid.into())
                    * 25
                    / BASIS_POINTS_128;
            }
            _ => (),
        }

        let token_price: u128 = sell_token_price * (BASIS_POINTS_128 - sell_fee) / BASIS_POINTS_128
            * ten_pow_buy_token_decimals
            / buy_token_price
            * (BASIS_POINTS_128 + buy_fee)
            / BASIS_POINTS_128 * (BASIS_POINTS_128 - delphor_base_fee) / BASIS_POINTS_128;

        // Calculate final amount with oracle price and fees
        let amount_to_send: u64 =
            u64::try_from(swap_amount as u128 * token_price / ten_pow_sell_token_decimals)
                .expect("Amount to send overflow");

        require!(amount_to_send >= min_amount, ErrorCode::InsufficientAmount);
        require!(
            user_vault_buy.amount >= amount_to_send,
            ErrorCode::VaultInsufficientAmount
        );

        match self.user_vault.vault_type {
            VaultType::PortfolioManager {
                auto_fee: _,
                tolerance: _,
            } => {
                let end_buy_usd = buy_token_price
                    * (user_vault_buy.amount - amount_to_send) as u128
                    / ten_pow_buy_token_decimals;
                let end_sell_usd = sell_token_price
                    * (user_vault_sell.amount + swap_amount) as u128
                    / ten_pow_sell_token_decimals;

                vault_usd_value += end_sell_usd + end_buy_usd;

                require!(
                    (end_buy_usd * BASIS_POINTS_128) / vault_usd_value >= user_vault_buy.min.into(),
                    ErrorCode::ExceedsMinAmount
                );
                require!(
                    (end_sell_usd * BASIS_POINTS_128) / vault_usd_value
                        <= user_vault_sell.max.into(),
                    ErrorCode::ExceedsMaxAmount
                );
            }
            VaultType::LiquidityProvider => {
                require!(
                    user_vault_buy.amount - amount_to_send >= user_vault_buy.min,
                    ErrorCode::ExceedsMinAmount
                );
                require!(
                    user_vault_sell.amount + swap_amount <= user_vault_sell.max,
                    ErrorCode::ExceedsMaxAmount
                );
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

        self.user_vault.vaults[position_buy as usize].timestamp =
            Clock::get().unwrap().unix_timestamp as u32;

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
