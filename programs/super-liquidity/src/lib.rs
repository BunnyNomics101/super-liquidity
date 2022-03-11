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

    declare_id!("4FCQYxXVaK1aWE7gTLhTB5CwyjZGRFPFJstJdcNsoqck");

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        ctx.accounts.process(amount)
    }

    pub fn withdraw(ctx: Context<Withdraw>, bump: u8, amount: u64) -> Result<()> {
        ctx.accounts.process(bump, amount)
    }

    pub fn swap(ctx: Context<Swap>, swap_amount: u64, min_amount: u64, bump: u8) -> Result<()> {
        ctx.accounts.process(swap_amount, min_amount, bump)
    }

    pub fn init_user_liquidity_provider(ctx: Context<InitUserLiquiidtyProvider>) -> Result<()> {
        ctx.accounts.process(*ctx.bumps.get("user_vault").unwrap())
    }

    pub fn update_user_liquidity_provider(
        ctx: Context<UpdateUserLiquidityProvider>,
        position: usize,
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
        ctx.accounts
            .process(*ctx.bumps.get("user_portfolio").unwrap())
    }

    pub fn update_user_portfolio(
        ctx: Context<UpdateUserPortfolio>,
        position: usize,
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

    // Admin functions
    pub fn initialize_global_state(ctx: Context<InitGlobalState>) -> Result<()> {
        ctx.accounts
            .process(*ctx.bumps.get("global_state").unwrap())
    }

    pub fn add_token(ctx: Context<AddToken>) -> Result<()> {
        ctx.accounts.process()
    }

    pub fn init_token_store(ctx: Context<InitTokenStore>) -> Result<()> {
        ctx.accounts.process()
    }
}
