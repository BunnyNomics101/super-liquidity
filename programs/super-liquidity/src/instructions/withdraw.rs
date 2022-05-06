use crate::states::*;
use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount, Transfer};

#[derive(Accounts)]
#[instruction(bump: u8, amount: u64, position: u8)]
pub struct Withdraw<'info> {
    #[account(
        seeds = [
            get_admin().as_ref(),
        ], 
        bump = global_state.bump
    )]
    pub global_state: Account<'info, GlobalState>,
    pub user_account: Signer<'info>,
    #[account(mut)]
    pub user_vault: Account<'info, UserVault>,
    /// user account to receive tokens
    #[account(mut)]
    pub send_token_to: Account<'info, TokenAccount>,
    /// CHECK:
    #[account(
        seeds = [
            "store_auth".as_ref()
        ],
        bump = bump,
    )]
    pub token_store_authority: AccountInfo<'info>,
    /// store to withdraw tokens from
    #[account(mut, constraint = token_store_pda.owner == token_store_authority.key(), constraint = token_store_pda.mint == send_token_to.mint)]
    pub token_store_pda: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}
impl<'info> Withdraw<'info> {
    #[access_control(
        check_token_position(&self.global_state, &self.token_store_pda.mint, position) && 
        check_vault(&self.user_account.key, &self.user_vault)
    )]
    pub fn process(&mut self, bump: u8, amount: u64, position: u8) -> Result<()> {
        let vault = &mut self.user_vault.vaults[position as usize];

        require!(vault.amount >= amount, ErrorCode::InsufficientFunds);

        let seeds: &[&[u8]] = &[b"store_auth", &[bump]];
        let signer = &[&seeds[..]];

        vault.amount -= amount;

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

        Ok(())
    }
}

// ------------
// -- Errors --
// ------------

#[error_code]
pub enum ErrorCode {
    #[msg("Insufficient funds in user vault")]
    InsufficientFunds,
}