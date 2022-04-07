use crate::states::*;
use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount, Transfer};

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(
        seeds = [
            get_admin().as_ref(),
        ], 
        bump = global_state.bump
    )]
    pub global_state: Account<'info, GlobalState>,
    #[account(mut)]
    pub user_vault: Account<'info, UserVault>,
    // Account where user has the tokens
    #[account(
        mut, 
        constraint = get_token_from.mint == token_store_pda.mint, 
        constraint = get_token_from.owner == get_token_from_authority.key()
    )]
    pub get_token_from: Account<'info, TokenAccount>,
    // Owner or delegate_authority. Must be also the owner of the vault
    pub get_token_from_authority: Signer<'info>,
    // Account where the program will store the tokens
    #[account(mut,
        constraint = token_store_pda.owner == Pubkey::find_program_address(&["store_auth".as_ref()], &crate::ID).0
    )]
    pub token_store_pda: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}
impl<'info> Deposit<'info> {
    #[access_control(
        check_token_position(&self.global_state, &self.token_store_pda.mint, position) && 
        check_vault(&self.get_token_from_authority.key, &self.user_vault)
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

        vault.amount += amount;

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

        vault.timestamp = Clock::get().unwrap().unix_timestamp as u32;
        Ok(())
    }
}