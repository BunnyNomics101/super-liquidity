use anchor_lang::prelude::*;
// use anchor_lang::solana_program::pubkey::Pubkey;

use instructions::{admin::*, deposit::*, swap::*, user::*, withdraw::*};

///error
pub mod error;
///instructions
pub mod instructions;
///states
pub mod states;

#[program]
pub mod super_liquidity {
    use super::*;

    declare_id!("4GpqkriT3ddFLN7dh9e65P2EZRdetqJR7wpMe9nPTpn6");

    pub fn deposit(ctx: Context<Deposit>, amount: u64, position: u8) -> Result<()> {
        ctx.accounts.process(amount, position)
    }

    pub fn withdraw(ctx: Context<Withdraw>, bump: u8, amount: u64, position: u8) -> Result<()> {
        ctx.accounts.process(bump, amount, position)
    }

    pub fn swap(
        ctx: Context<Swap>,
        swap_amount: u64,
        min_amount: u64,
        bump: u8,
        position_buy: u8,
        position_sell: u8,
    ) -> Result<()> {
        ctx.accounts
            .process(swap_amount, min_amount, bump, position_buy, position_sell)
    }

    pub fn init_user_liquidity_provider(ctx: Context<InitUserLiquidityProvider>) -> Result<()> {
        ctx.accounts.process(*ctx.bumps.get("user_vault").unwrap())
    }

    pub fn update_user_liquidity_provider(
        ctx: Context<UpdateUserLiquidityProvider>,
        position: u8,
        buy_fee: u16,
        sell_fee: u16,
        min: u64,
        max: u64,
        receive_status: bool,
        provide_status: bool,
        limit_price_status: bool,
        limit_price: u64,
    ) -> Result<()> {
        ctx.accounts.process(
            position,
            buy_fee,
            sell_fee,
            min,
            max,
            receive_status,
            provide_status,
            limit_price_status,
            limit_price,
        )
    }

    pub fn init_user_portfolio(ctx: Context<InitUserPortfolio>) -> Result<()> {
        ctx.accounts.process(*ctx.bumps.get("user_vault").unwrap())
    }

    pub fn update_user_portfolio(
        ctx: Context<UpdateUserPortfolio>,
        position: u8,
        mid: u64,
        limit_price_status: bool,
        limit_price: u64,
        tolerance: u16,
    ) -> Result<()> {
        ctx.accounts
            .process(position, mid, limit_price_status, limit_price, tolerance)
    }

    // Admin functions
    pub fn initialize_global_state(ctx: Context<InitGlobalState>) -> Result<()> {
        ctx.accounts
            .process(*ctx.bumps.get("global_state").unwrap())
    }

    pub fn add_token(ctx: Context<AddToken>) -> Result<()> {
        ctx.accounts.process()
    }
}
