use crate::states::UserCoinVault;
use anchor_lang::prelude::*;
use anchor_spl::token::{TokenAccount, Transfer};

//-----------------------------------------------------
#[derive(Accounts)]
pub struct Withdraw<'info> {
    /*
    #[account(mut)]
    pub state: AccountInfo<'info>,
    */
    #[account(mut)]
    pub user_vault: Account<'info, UserCoinVault>,
    #[account(mut)]
    pub defi_token_mint: AccountInfo<'info>,
    #[account(mut)]
    /// user account to receive tokens
    pub send_token_to: Account<'info, TokenAccount>, 
    #[account(mut)]
    /// store to withdraw tokens from
    pub token_store_pda: Account<'info, TokenAccount>, 
    #[account(signer)]
    /// burn_defi_token_from owner or delegate_authority
    pub user_account: AccountInfo<'info>, 
    pub system_program: AccountInfo<'info>,
    pub token_program: AccountInfo<'info>,
}
impl<'info> Withdraw<'info> {
    pub fn process(&mut self, amount: u64) -> ProgramResult {

        // check mint
        if self.token_store_pda.mint != self.send_token_to.mint {
            msg!(
                "Invalid send_token_to.mint {}. Expected {}",
                self.send_token_to.mint,
                self.token_store_pda.mint,
            );
            return Err(ProgramError::InvalidAccountData)
        }

        /*
        // if delegated, check delegated amount
        if *self.user_account.key != self.token_store_pda.owner {
            msg!(
                "invalid token_store_pda owner/auth",
                );
            return Err(DelphorError::NotTheOwner.into());
        }
        */

        if self.token_store_pda.amount < amount {
            msg!(
                "Requested to withdraw {} but you have only {}",
                amount,
                self.token_store_pda.amount
            );
            return Err(ProgramError::InsufficientFunds);
        }

        anchor_spl::token::transfer(
            CpiContext::new(
                self.token_program.clone(),
                Transfer {
                    from: self.token_store_pda.to_account_info(),
                    to: self.send_token_to.to_account_info(),
                    authority: self.user_account.clone(),
                },
            ),
            amount,
        )?;

        Ok(())
    }
}
