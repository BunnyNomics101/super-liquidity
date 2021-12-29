use crate::states::*;
use anchor_lang::prelude::*;
use anchor_spl::token::Mint;

//-----------------------------------------------------
#[derive(Accounts)]
#[instruction(bump: u8)]
pub struct Initialize<'info> {
    // admin account
    #[account(signer)]
    pub admin_account: AccountInfo<'info>,

    // Global state, create PDA
    #[account(
        init,
        payer = admin_account,
        space = 8 + core::mem::size_of::<GlobalState>() + 128, // 128 bytes future expansion
        seeds = [
            admin_account.key().as_ref(),
        ],
        bump = bump,
    )]
    pub global_state: Account<'info, GlobalState>,

    pub system_program: AccountInfo<'info>,
}
impl<'info> Initialize<'info> {
    #[allow(unused_variables)]
    pub fn process(&mut self, bump: u8) -> ProgramResult {
        self.global_state.admin_account = *self.admin_account.key;
        Ok(())
    }
}

//-----------------------------------------------------
#[derive(Accounts)]
#[instruction(bump: u8)]
pub struct InitUserVault<'info> {
    // global state
    pub global_state: Account<'info, GlobalState>,

    // user account, signer
    pub user_account: Signer<'info>,

    // for what token
    pub mint: Account<'info, Mint>,

    // user vault, create PDA
    #[account(
        init,
        payer = user_account,
        space = 8 + core::mem::size_of::<UserCoinVault>() + 128, // 128 bytes future expansion
        seeds = [
            user_account.key().as_ref(),
            mint.key().as_ref(),
        ],
        bump = bump,
    )]
    pub user_vault: Account<'info, UserCoinVault>,

    pub system_program: AccountInfo<'info>,
}
impl<'info> InitUserVault<'info> {
    #[allow(unused_variables)]
    pub fn process(&mut self, bump: u8, buy_fee: u32, sell_fee: u32) -> ProgramResult {
        self.user_vault.buy_fee = buy_fee;
        self.user_vault.sell_fee = sell_fee;
        self.user_vault.pause = false;
        Ok(())
    }
}

//--------------------------------------
#[derive(Accounts)]
pub struct ChangeAuthority<'info> {
    // global state
    #[account(mut, has_one = admin_account)]
    pub global_state: Account<'info, GlobalState>,

    // current admin account (must match the one in GlobalState)
    #[account(signer)]
    pub admin_account: AccountInfo<'info>,

    // new admin account
    pub new_admin_account: AccountInfo<'info>,
}
impl<'info> ChangeAuthority<'info> {
    pub fn process(&mut self) -> ProgramResult {
        self.global_state.admin_account = *self.new_admin_account.key;
        Ok(())
    }
}

//-----------------------------------------------------
#[derive(Accounts)]
pub struct UpdateUserVault<'info> {
    // global state
    #[account(has_one = admin_account)]
    pub global_state: Account<'info, GlobalState>,

    // admin account
    #[account(signer)]
    pub admin_account: AccountInfo<'info>,

    #[account(mut)]
    pub user_vault: Account<'info, UserCoinVault>,
}
impl<'info> UpdateUserVault<'info> {
    pub fn process(&mut self, sell_fee: u32, buy_fee: u32) -> ProgramResult {
        self.user_vault.buy_fee = buy_fee;
        self.user_vault.sell_fee = sell_fee;
        Ok(())
    }
}
