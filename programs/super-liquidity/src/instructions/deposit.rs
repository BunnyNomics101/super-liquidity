use crate::error::*;
use crate::states::*;
use anchor_lang::prelude::*;
use anchor_spl::token::{TokenAccount, Transfer, Token, Mint};

//-----------------------------------------------------
// Deposit Instruction
#[derive(Accounts)]
pub struct Deposit<'info> {
    /// CHECK:
    pub user_account: AccountInfo<'info>,
    // User PDA according to the deposited token
    #[account(mut, seeds = [
        user_account.key().as_ref(), mint.key().as_ref()
    ], bump = user_vault.bump)]
    pub user_vault: Account<'info, UserCoinVault>,
    /// CHECK:
    pub token_store_authority: AccountInfo<'info>,
    // for what token
    pub mint: Account<'info, Mint>,
    // Account where user have tokens
    #[account(mut, associated_token::mint = mint, associated_token::authority = get_token_from_authority)]
    pub get_token_from: Account<'info, TokenAccount>,
    // owner or delegate_authority
    pub get_token_from_authority: Signer<'info>,
    // Account where the program will store the tokens
    #[account(mut, associated_token::mint = mint, associated_token::authority = token_store_authority)]
    pub token_store_pda: Account<'info, TokenAccount>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}
impl<'info> Deposit<'info> {
    pub fn process(&mut self, amount: u64) -> Result<()> {
        // check mint
        if self.get_token_from.mint != self.user_vault.mint {
            msg!(
                "Invalid get_token_from.mint {}. Expected {}",
                self.get_token_from.mint,
                self.user_vault.mint,
            );
            return Err(ProgramError::InvalidAccountData.into());
        }

        // if delegated, check delegated amount
        if *self.get_token_from_authority.key != self.get_token_from.owner {
            msg!("invalid get_token_from owner/auth",);
            return Err(error!(DelphorError::NotTheOwner));
        }

        if self.get_token_from.amount < amount {
            msg!(
                "Requested to deposit {} but you have only {}",
                amount,
                self.get_token_from.amount
            );
            return Err(ProgramError::InsufficientFunds.into());
        }
        //TODO check token_store_pda == find_program_address(user_vault.mint,"TSTORE").0

        let (pda, _bump_seed) = Pubkey::find_program_address(
            &[
                self.get_token_from_authority.to_account_info().key.as_ref(),
                self.mint.to_account_info().key.as_ref(),
            ],
            &crate::ID,
        );

        if *self.user_vault.to_account_info().key != pda {
            msg!(
                "Invalid user_vault {}. Expected {}",
                self.user_vault.to_account_info().key,
                pda,
            );
            return Err(ProgramError::InvalidAccountData.into());
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

        self.user_vault.amount += amount;
        self.user_vault.timestamp = Clock::get().unwrap().unix_timestamp as u32;
        Ok(())
    }
}
