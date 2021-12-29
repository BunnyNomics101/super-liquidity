use anchor_lang::prelude::*;
// use anchor_lang::solana_program::pubkey::Pubkey;

use instructions::{admin::*, deposit::*, withdraw::*};

///error
pub mod error;
///instructions
pub mod instructions;
///states
pub mod states;

#[program]
pub mod super_liquidity {
    use super::*;

    declare_id!("GD7B9rYsWeuLyYMTDa9z5C7osPg5gMDZZZqpF5NEmGXD");

    ///deposit
    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> ProgramResult {
        ctx.accounts.process(amount)
    }

    ///withdraw
    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> ProgramResult {
        ctx.accounts.process(amount)
    }

    // -------------
    // ---- Admin --
    // -------------
    ///create global state
    pub fn initialize(ctx: Context<Initialize>, bump: u8) -> ProgramResult {
        ctx.accounts.process(bump)
    }

    ///create user vault
    pub fn init_user_vault(ctx: Context<InitUserVault>, bump: u8, min_fee: u32, max_fee: u32) -> ProgramResult {
        ctx.accounts.process(bump, min_fee, max_fee)
    }

    ///update user state
    pub fn update_user_vault(
        ctx: Context<UpdateUserVault>,
        buy_fee_bp: u32,
        sell_fee_bp: u32,
    ) -> ProgramResult {
        ctx.accounts.process(buy_fee_bp, sell_fee_bp)
    }
}
