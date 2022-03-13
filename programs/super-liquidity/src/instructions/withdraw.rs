use crate::states::*;
use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount, Transfer, Mint};

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(
        seeds = [
            ADMIN_ADDRESS.as_ref(),
        ], 
        bump = global_state.bump
    )]
    pub global_state: Account<'info, GlobalState>,
    pub user_account: Signer<'info>,
    pub user_vault: Account<'info, UserVault>,
    /// user account to receive tokens
    #[account(mut)]
    pub send_token_to: Account<'info, TokenAccount>,
    /// CHECK:
    #[account(mut)]
    pub token_store_authority: AccountInfo<'info>,
    pub mint: Account<'info, Mint>,
    /// store to withdraw tokens from
    #[account(mut, associated_token::mint = mint, associated_token::authority = token_store_authority, constraint = token_store_pda.mint == send_token_to.mint)]
    pub token_store_pda: Account<'info, TokenAccount>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}
impl<'info> Withdraw<'info> {
    #[access_control(
        check_token_position(&self.global_state, &self.mint, position) && 
        check_vault(&self.user_account, &self.mint, &self.user_vault)
    )]
    pub fn process(&mut self, bump: u8, amount: u64, position: usize) -> Result<()> {
        let vault = &mut self.user_vault.vaults[position];
        if vault.amount < amount {
            msg!(
                "Requested to withdraw {} but you have only {}",
                amount,
                vault.amount
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

        vault.amount -= amount;

        Ok(())
    }
}
