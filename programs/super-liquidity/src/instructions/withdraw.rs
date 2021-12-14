use crate::states::UserVault;
use anchor_lang::prelude::*;

//-----------------------------------------------------
#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub state: AccountInfo<'info>,
    #[account(mut)]
    pub user_vault: ProgramAccount<'info, UserVault>,
    #[account(mut)]
    pub defi_token_mint: AccountInfo<'info>,
    #[account(mut)]
    pub get_token_from: AccountInfo<'info, TokenAccount>,
    #[account(signer)]
    pub get_token_from_authority: AccountInfo<'info>, //burn_defi_token_from owner or delegate_authority
    pub system_program: AccountInfo<'info>,
    pub token_program: AccountInfo<'info>,
}
impl<'info> Withdraw<'info> {
    pub fn process(&mut self, defi_token_amount: u64) -> ProgramResult {
        Ok(())
    }
}
