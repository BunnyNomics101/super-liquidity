use crate::states::UserCoinVault;
use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount, Transfer};

//-----------------------------------------------------
#[derive(Accounts)]
pub struct Withdraw<'info> {
    /// CHECK:
    pub vault_user: AccountInfo<'info>,
    #[account(mut, seeds = [
        vault_user.key().as_ref(), mint.key().as_ref()
    ], bump = user_vault.bump)]
    pub user_vault: Account<'info, UserCoinVault>,
    /// CHECK:
    pub mint: AccountInfo<'info>,
    /// user account to receive tokens
    #[account(mut)]
    pub send_token_to: Account<'info, TokenAccount>, 
    /// CHECK:
    #[account(mut)]
    pub token_store_authority: AccountInfo<'info>,
    /// store to withdraw tokens from
    #[account(mut, associated_token::mint = mint, associated_token::authority = token_store_authority)]
    pub token_store_pda: Account<'info, TokenAccount>, 
    /// burn_defi_token_from owner or delegate_authority
    pub user_account: Signer<'info>, 
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}
impl<'info> Withdraw<'info> {
    pub fn process(&mut self, bump: u8, amount: u64) -> Result<()> {

        // check mint
        if self.token_store_pda.mint != self.send_token_to.mint {
            msg!(
                "Invalid send_token_to.mint {}. Expected {}",
                self.send_token_to.mint,
                self.token_store_pda.mint,
            );
            return Err(ProgramError::InvalidAccountData.into())
        }

        let (pda, _bump_seed) = Pubkey::find_program_address(&[self.user_account.to_account_info().key.as_ref(), self.mint.to_account_info().key.as_ref()], &crate::ID);

        if *self.user_vault.to_account_info().key != pda {
            msg!(
                "Invalid user_vault {}. Expected {}",
                self.user_vault.to_account_info().key,
                pda,
            );
            return Err(ProgramError::InvalidAccountData.into())
        }

        if self.user_vault.amount < amount {
            msg!(
                "Requested to withdraw {} but you have only {}",
                amount,
                self.user_vault.amount
            );
            return Err(ProgramError::InsufficientFunds.into());
        }

        let seeds: &[&[u8]] = &[b"store_auth", &[bump]];
        let signer = &[&seeds[..]];

        anchor_spl::token::transfer(
            CpiContext::new_with_signer(
                self.token_program.to_account_info().clone(),
                Transfer {
                    from: self.token_store_pda.to_account_info(),
                    to: self.send_token_to.to_account_info(),
                    authority: self.token_store_authority.to_account_info(),
                },
                signer
            ),
            amount,
        )?;

        self.user_vault.amount -= amount;

        Ok(())
    }
}
