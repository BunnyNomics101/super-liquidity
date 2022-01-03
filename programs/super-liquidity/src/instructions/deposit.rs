use crate::states::*;
use anchor_lang::prelude::*;
use anchor_spl::token::Mint;
use anchor_spl::token::{TokenAccount, Transfer};
use crate::error::*;

//-----------------------------------------------------
// Deposit Instruction
#[derive(Accounts)]
#[instruction(bump: u8)]
pub struct Deposit<'info> {
    // User PDA according to the deposited token
    #[account(mut)]
    pub user_vault: Account<'info, UserCoinVault>, 
    pub token_store_authority: AccountInfo<'info>,
    // for what token
    pub mint: Account<'info, Mint>,
    // Account where user have tokens
    #[account(mut)]
    pub get_token_from: Account<'info, TokenAccount>, 
    // owner or delegate_authority
    #[account(signer)]
    pub get_token_from_authority: AccountInfo<'info>,
    // Account where the program will store the tokens
    #[account(mut, associated_token::mint = mint, associated_token::authority = token_store_authority)]
    pub token_store_pda: Account<'info, TokenAccount>, 
    pub system_program: AccountInfo<'info>,
    pub token_program: AccountInfo<'info>,
}
impl<'info> Deposit<'info> {
    pub fn process(&mut self, amount: u64) -> ProgramResult {

        // check mint
        if self.get_token_from.mint != self.user_vault.mint {
            msg!(
                "Invalid get_token_from.mint {}. Expected {}",
                self.get_token_from.mint,
                self.user_vault.mint,
            );
            return Err(ProgramError::InvalidAccountData)
        }

        // if delegated, check delegated amount
        if *self.get_token_from_authority.key != self.get_token_from.owner {
            msg!(
                "invalid get_token_from owner/auth",
                );
            return Err(DelphorError::NotTheOwner.into());
        }

        if self.get_token_from.amount < amount {
            msg!(
                "Requested to deposit {} but you have only {}",
                amount,
                self.get_token_from.amount
            );
            return Err(ProgramError::InsufficientFunds);
        }
    
        //TODO check token_store_pda == find_program_address(user_vault.mint,"TSTORE").0

        anchor_spl::token::transfer(
            CpiContext::new(
                self.token_program.clone(),
                Transfer {
                    from: self.get_token_from.to_account_info(),
                    to: self.token_store_pda.to_account_info(),
                    authority: self.get_token_from_authority.clone(),
                },
            ),
            amount,
        )?;

        Ok(())
    }
}
