use anchor_lang::prelude::*;
// use anchor_lang::solana_program::pubkey::Pubkey;

use instructions::{admin::*, deposit::*, withdraw::*, swap::*};

///error
pub mod error;
///instructions
pub mod instructions;
///states
pub mod states;

#[program]
pub mod super_liquidity {
    use super::*;

    declare_id!("2XwMaJUsBUmiRAVXQ3ExzWgvojtDwHyh33nq3rWykJhp");

    ///deposit
    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> ProgramResult {
        ctx.accounts.process(amount)
    }

    ///withdraw
    pub fn withdraw(ctx: Context<Withdraw>, bump: u8, amount: u64) -> ProgramResult {
        ctx.accounts.process(bump, amount)
    }

    pub fn swap(ctx: Context<Swap>, swap_amount: u64, min_amount: u64, bump: u8) -> ProgramResult {
        ctx.accounts.process(swap_amount, min_amount, bump)
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

    ///initialize token store
    pub fn init_token_store(ctx: Context<InitTokenStore>, bump: u8) -> ProgramResult {
        ctx.accounts.process(bump)
    }

    ///update user state
    pub fn update_user_vault(
        ctx: Context<UpdateUserVault>,
        buy_fee_bp: u32,
        sell_fee_bp: u32,
        min: u64,
        max: u64,
    ) -> ProgramResult {
        ctx.accounts.process(buy_fee_bp, sell_fee_bp, min, max)
    }
    
}
