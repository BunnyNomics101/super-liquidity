use crate::states::UserCoinVault;
use anchor_lang::prelude::*;
use anchor_spl::token::{TokenAccount};


//-----------------------------------------------------
#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub state: AccountInfo<'info>,
    #[account(mut)]
    pub user_vault: Account<'info, UserCoinVault>,
    #[account(mut)]
    pub defi_token_mint: AccountInfo<'info>,
    #[account(mut)]
    pub get_token_from: Account<'info, TokenAccount>,
    #[account(signer)]
    pub get_token_from_authority: AccountInfo<'info>, //burn_defi_token_from owner or delegate_authority
    pub system_program: AccountInfo<'info>,
    pub token_program: AccountInfo<'info>,
}
impl<'info> Withdraw<'info> {
    pub fn process(&mut self, _defi_token_amount: u64) -> ProgramResult {
        Ok(())
    }
}
