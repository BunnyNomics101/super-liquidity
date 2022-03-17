use crate::states::*;
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount, Transfer};

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(
        seeds = [
            ADMIN_ADDRESS.as_ref(),
        ], 
        bump = global_state.bump
    )]
    pub global_state: Account<'info, GlobalState>,
    /// CHECK:
    pub user_account: AccountInfo<'info>,
    pub user_vault: Account<'info, UserVault>,
    /// CHECK:
    pub token_store_authority: AccountInfo<'info>,
    pub mint: Account<'info, Mint>,
    // Account where user has the tokens
    #[account(mut, associated_token::mint = mint, associated_token::authority = get_token_from_authority)]
    pub get_token_from: Account<'info, TokenAccount>,
    // owner or delegate_authority
    pub get_token_from_authority: Signer<'info>,
    // Account where the program will store the tokens
    #[account(mut, associated_token::mint = mint, associated_token::authority = token_store_authority)]
    pub token_store_pda: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}
impl<'info> Deposit<'info> {
    #[access_control(
        check_token_position(&self.global_state, &self.mint, position) && 
        check_vault(&self.user_account.key, &self.user_vault)
    )]
    pub fn process(&mut self, amount: u64, position: u8) -> Result<()> {
        let vault = &mut self.user_vault.vaults[position as usize];

        if self.get_token_from.amount < amount {
            msg!(
                "Requested to deposit {} but you have only {}",
                amount,
                self.get_token_from.amount
            );
            return Err(ProgramError::InsufficientFunds.into());
        }

        anchor_spl::token::transfer(
            CpiContext::new(
                self.token_program.to_account_info().clone(),
                Transfer {
                    from: self.get_token_from.to_account_info(),
                    to: self.token_store_pda.to_account_info(),
                    authority: self.get_token_from_authority.to_account_info().clone(),
                },
            ),
            amount,
        )?;

        vault.amount += amount;
        vault.timestamp = Clock::get().unwrap().unix_timestamp as u32;
        Ok(())
    }
}