use anchor_lang::prelude::*;
use anchor_lang::solana_program::declare_id;
use anchor_lang::solana_program::pubkey::Pubkey;

use instructions::{admin::*, deposit_sol::*, deposit_stake_account::*, liquid_unstake::*};

///error
pub mod error;
///instructions
pub mod instructions;
///states
pub mod states;

#[program]
pub mod super_liquidity {
    use super::*;

    declare_id!("Def7dYpDD44MxCctkJBfwrzoQFAGrycYo5cpdknMgsqS");

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
    pub fn initialize(ctx: Context<Initialize>) -> ProgramResult {
        ctx.accounts.process()
    }

    ///create user vault
    pub fn init_user_vault(ctx: Context<InitUserVault>) -> ProgramResult {
        ctx.accounts.process()
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
