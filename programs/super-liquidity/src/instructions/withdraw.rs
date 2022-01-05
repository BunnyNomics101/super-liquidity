use crate::states::UserCoinVault;
use anchor_lang::prelude::*;
use anchor_spl::token::{TokenAccount, Transfer};

//-----------------------------------------------------
#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub user_vault: Account<'info, UserCoinVault>,
    #[account(mut)]
    pub mint: AccountInfo<'info>,
    /// user account to receive tokens
    #[account(mut)]
    pub send_token_to: Account<'info, TokenAccount>, 
    #[account(mut)]
    pub token_store_authority: AccountInfo<'info>,
    /// store to withdraw tokens from
    #[account(mut, associated_token::mint = mint, associated_token::authority = token_store_authority)]
    pub token_store_pda: Account<'info, TokenAccount>, 
    /// burn_defi_token_from owner or delegate_authority
    #[account(signer)]
    pub user_account: AccountInfo<'info>, 
    pub system_program: AccountInfo<'info>,
    pub token_program: AccountInfo<'info>,
}
impl<'info> Withdraw<'info> {
    pub fn process(&mut self, bump: u8, amount: u64) -> ProgramResult {

        // check mint
        if self.token_store_pda.mint != self.send_token_to.mint {
            msg!(
                "Invalid send_token_to.mint {}. Expected {}",
                self.send_token_to.mint,
                self.token_store_pda.mint,
            );
            return Err(ProgramError::InvalidAccountData)
        }

        let (pda, _bump_seed) = Pubkey::find_program_address(&[self.user_account.to_account_info().key.as_ref(), self.mint.to_account_info().key.as_ref()], &crate::ID);

        if *self.user_vault.to_account_info().key != pda {
            msg!(
                "Invalid user_vault {}. Expected {}",
                self.user_vault.to_account_info().key,
                pda,
            );
            return Err(ProgramError::InvalidAccountData)
        }

        if self.user_vault.amount < amount {
            msg!(
                "Requested to withdraw {} but you have only {}",
                amount,
                self.user_vault.amount
            );
            return Err(ProgramError::InsufficientFunds);
        }

        let seeds: &[&[u8]] = &[b"store_auth", &[bump]];
        let signer = &[&seeds[..]];

        anchor_spl::token::transfer(
            CpiContext::new_with_signer(
                self.token_program.clone(),
                Transfer {
                    from: self.token_store_pda.to_account_info(),
                    to: self.send_token_to.to_account_info(),
                    authority: self.token_store_authority.to_account_info(),
                },
                signer
            ),
            amount,
        )?;

        Ok(())
    }
}
