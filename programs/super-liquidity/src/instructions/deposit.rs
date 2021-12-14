use crate::states::UserVault;
use anchor_lang::prelude::*;

//-----------------------------------------------------
#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub vault: AccountInfo<'info, UserVault>,
    #[account(mut, signer)]
    pub transfer_from: AccountInfo<'info>,
    #[account(mut)]
    pub system_program: AccountInfo<'info>,
    pub token_program: AccountInfo<'info>,
}
impl<'info> Deposit<'info> {
    pub fn process(&mut self, lamports: u64) -> ProgramResult {
        // find token in vault.coins
        // SPL transfer
        Ok(())
    }
}
