use crate::states::UserCoinVault;
use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount, Transfer, Mint};

//-----------------------------------------------------
#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut, seeds = [
        user_account.key().as_ref(), mint.key().as_ref()
    ], bump = user_vault.bump)]
    pub user_vault: Account<'info, UserCoinVault>,
    pub mint: Account<'info, Mint>,
    /// user account to receive tokens
    #[account(mut)]
    pub send_token_to: Account<'info, TokenAccount>,
    /// CHECK:
    #[account(mut)]
    pub token_store_authority: AccountInfo<'info>,
    /// store to withdraw tokens from
    #[account(mut, associated_token::mint = mint, associated_token::authority = token_store_authority, constraint = token_store_pda.mint == send_token_to.mint)]
    pub token_store_pda: Account<'info, TokenAccount>,
    /// burn_defi_token_from owner or delegate_authority
    pub user_account: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}
impl<'info> Withdraw<'info> {
    pub fn process(&mut self, bump: u8, amount: u64) -> Result<()> {
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
                signer,
            ),
            amount,
        )?;

        self.user_vault.amount -= amount;

        Ok(())
    }
}
