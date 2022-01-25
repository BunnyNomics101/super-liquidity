use crate::error::*;
use crate::states::*;
use anchor_lang::prelude::*;
use anchor_spl::token::Mint;
use anchor_spl::token::{TokenAccount, Transfer};
use delphor_oracle::CoinData;

//-----------------------------------------------------
// Swap Instruction
#[derive(Accounts)]
#[instruction(bump: u8)]
pub struct Swap<'info> {
    // Account with price from oracle
    #[account(owner = delphor_oracle::ID)]
    pub get_coin_data: Account<'info, CoinData>,
    #[account(owner = delphor_oracle::ID)]
    pub send_coin_data: Account<'info, CoinData>,
    // User PDA according to the swaped token
    #[account(mut)]
    pub user_vault: Account<'info, UserCoinVault>,
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
    // User account to send tokens
    #[account(mut)]
    pub send_token_to: Account<'info, TokenAccount>,
    // PDA to withdraw tokens
    #[account(mut, associated_token::mint = mint_send, associated_token::authority = token_store_authority)]
    pub token_store_pda_from: Account<'info, TokenAccount>,
    // PDA to deposit tokens
    #[account(mut, associated_token::mint = mint_receive, associated_token::authority = token_store_authority)]
    pub token_store_pda_to: Account<'info, TokenAccount>,
    pub system_program: AccountInfo<'info>,
    pub token_program: AccountInfo<'info>,
}
impl<'info> Swap<'info> {
    pub fn process(&mut self, swap_amount: u64, min_amount: u64) -> ProgramResult {
        let get_coin_price = self.get_coin_data.price;
        let get_coin_decimals = self.get_coin_data.decimals;
        let send_coin_price = self.send_coin_data.price;
        let send_coin_decimals = self.send_coin_data.decimals;
        let user_vault = &mut self.user_vault;
        let amount_to_send: u64;

        let token_price: u64 = (get_coin_price * u64::pow(10, send_coin_decimals)
            / send_coin_price)
            * (10000 - user_vault.sell_fee as u64)
            / 10000;

        // Calculate final amount with oracle price and fees
        amount_to_send = swap_amount.pow(get_coin_decimals) / token_price;

        if amount_to_send < min_amount {
            return Err(ErrorCode::InsufficientAmount.into());
        }

        if user_vault.amount < amount_to_send {
            return Err(ErrorCode::VaultInsufficientAmount.into());
        }

        anchor_spl::token::transfer(
            CpiContext::new(
                self.token_program.clone(),
                Transfer {
                    from: self.get_token_from.to_account_info(),
                    to: self.token_store_pda_to.to_account_info(),
                    authority: self.get_token_from_authority.clone(),
                },
            ),
            swap_amount,
        )?;

        // TODO: Sumar swap_amount a amount del vault que recibe

        anchor_spl::token::transfer(
            CpiContext::new(
                self.token_program.clone(),
                Transfer {
                    from: self.token_store_pda_from.to_account_info(),
                    to: self.send_token_to.to_account_info(),
                    authority: self.token_store_authority.clone(),
                },
            ),
            amount_to_send,
        )?;

        user_vault.amount -= amount_to_send;

        Ok(())
    }
}

// ------------
// -- Errors --
// ------------
#[error]
pub enum ErrorCode {
    #[msg("Final amount lower than min_amount.")]
    InsufficientAmount,
    #[msg("Vault insufficient balance.")]
    VaultInsufficientAmount,
}
