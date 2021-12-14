use crate::constant::*;
use crate::error::*;
use crate::states::*;
use anchor_lang::anchor_spl::token::{Mint, TokenAccount, Transfer};
use anchor_lang::prelude::*;

//-----------------------------------------------------
#[derive(Accounts)]
pub struct Initialize<'info> {
    // admin account
    #[account(signer)]
    pub admin_account: AccountInfo<'info>,

    #[account(zero)]
    pub global_state: State<'info, GlobalState>,
}
impl<'info> Initialize<'info> {
    pub fn process(&mut self) -> ProgramResult {
        self.global_state.admin_account = *self.admin_account.key;
        Ok(())
    }
}

//-----------------------------------------------------
#[derive(Accounts)]
pub struct InitUserVault<'info> {
    // global state
    #[account(has_one = admin_account)]
    pub global_state: ProgramAccount<'info, GlobalState>,

    // admin account, signer
    #[account(signer)]
    pub admin_account: AccountInfo<'info>,

    pub user_account: AccountInfo<'info>,

    #[account(zero)] // must be created but empty, ready to be initialized
    pub user_vault: ProgramAccount<'info, UserCoinVault>,

    pub system_program: AccountInfo<'info>,
}
impl<'info> InitUserVault<'info> {
    pub fn process(&mut self, buy_fee: u32, sell_fee: u32) -> ProgramResult {
        self.user_vault.global_state = self.global_state;

        self.user_vault.coins = vec![CoinInfo, 50];

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
    pub global_state: ProgramAccount<'info, GlobalState>,

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
    pub global_state: ProgramAccount<'info, GlobalState>,

    // admin account
    #[account(signer)]
    pub admin_account: AccountInfo<'info>,

    #[account(mut)]
    pub user_vault: ProgramAccount<'info, UserCoinVault>,
}
impl<'info> UpdateUserVault<'info> {
    pub fn process(&mut self, min_fee: u32, max_fee: u32) -> ProgramResult {
        self.user_vault.buy_fee = buy_fee;
        self.user_vault.sell_fee = sell_fee;
        Ok(())
    }
}
