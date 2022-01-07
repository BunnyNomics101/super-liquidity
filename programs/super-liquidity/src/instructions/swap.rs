use crate::states::*;
use anchor_lang::prelude::*;
use anchor_spl::token::Mint;
use anchor_spl::token::{TokenAccount, Transfer};
use crate::error::*;

//-----------------------------------------------------
// Swap Instruction
#[derive(Accounts)]
#[instruction(bump: u8)]
pub struct Swap<'info> {
    // TODO: Determine how the swap function will work.
    
    /*
    // User PDA according to the swaped token
    #[account(mut)]
    pub user_vault: Account<'info, UserCoinVault>, 
    */
    pub token_store_authority: AccountInfo<'info>,
    // token user sends
    pub mint_send: Account<'info, Mint>,
    // token user wants
    pub mint_receive: Account<'info, Mint>,
    // Account where user have tokens
    #[account(mut)]
    pub get_token_from: Account<'info, TokenAccount>, 
    // owner or delegate_authority
    #[account(signer)]
    pub get_token_from_authority: AccountInfo<'info>,
    // PDA to withdraw tokens
    #[account(mut, associated_token::mint = mint_send, associated_token::authority = token_store_authority)]
    pub token_store_pda_to: Account<'info, TokenAccount>, 
    // PDA to deposit tokens
    #[account(mut, associated_token::mint = mint_receive, associated_token::authority = token_store_authority)]
    pub token_store_pda_from: Account<'info, TokenAccount>, 
    pub system_program: AccountInfo<'info>,
    pub token_program: AccountInfo<'info>,
}
impl<'info> Swap<'info> {
    pub fn process(&mut self, amount: u64) -> ProgramResult {

        Ok(())
    }
}
