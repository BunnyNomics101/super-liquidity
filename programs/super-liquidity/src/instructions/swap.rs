use crate::states::*;
use anchor_lang::prelude::*;
use anchor_spl::token::Mint;
use anchor_spl::token::{TokenAccount, Transfer};
use delphor_oracle_aggregator::CoinData;

//-----------------------------------------------------
// Swap Instruction
#[derive(Accounts)]
pub struct Swap<'info> {
    // Accounts with price from oracle
    pub get_coin_data: Account<'info, CoinData>,
    pub send_coin_data: Account<'info, CoinData>,
    // user_vault_from and user_vault_to must be from the same user
    #[account(mut, seeds = [
        user_vault_to.user.key().as_ref(), mint_receive.key().as_ref()
    ], bump = user_vault_from.bump)]
    pub user_vault_from: Box<Account<'info, UserCoinVault>>,
    #[account(mut, seeds = [
        user_vault_from.user.key().as_ref(), mint_send.key().as_ref()
    ], bump = user_vault_to.bump)]
    pub user_vault_to: Box<Account<'info, UserCoinVault>>,
    #[account(mut)]
    pub token_store_authority: AccountInfo<'info>,
    // token user sends
    pub mint_send: Account<'info, Mint>,
    // token user wants
    pub mint_receive: Account<'info, Mint>,
    // Account where user have tokens
    #[account(mut, associated_token::mint = mint_send, associated_token::authority = get_token_from_authority)]
    pub get_token_from: Box<Account<'info, TokenAccount>>,
    // owner or delegate_authority
    #[account(signer)]
    pub get_token_from_authority: AccountInfo<'info>,
    // User account to send tokens
    #[account(mut)]
    pub send_token_to: Box<Account<'info, TokenAccount>>,
    // PDA to withdraw tokens
    #[account(mut, associated_token::mint = mint_receive, associated_token::authority = token_store_authority)]
    pub token_store_pda_from: Box<Account<'info, TokenAccount>>,
    // PDA to deposit tokens
    #[account(mut, associated_token::mint = mint_send, associated_token::authority = token_store_authority)]
    pub token_store_pda_to: Box<Account<'info, TokenAccount>>,
    pub system_program: AccountInfo<'info>,
    pub token_program: AccountInfo<'info>,
}
impl<'info> Swap<'info> {
    pub fn process(&mut self, swap_amount: u64, min_amount: u64, bump: u8) -> ProgramResult {
        let get_coin_price = self.get_coin_data.price;
        let get_coin_decimals = self.get_coin_data.decimals;
        let send_coin_price = self.send_coin_data.price;
        let send_coin_decimals = self.send_coin_data.decimals;
        let user_vault_from = &mut self.user_vault_from;
        let user_vault_to = &mut self.user_vault_to;

        if !user_vault_from.swap_to.contains(&self.mint_send.key()) {
            return Err(ErrorCode::VaultDoesntAcceptToken.into());
        }

        let (get_coin_pda, _bump_seed) = Pubkey::find_program_address(
            &[self.mint_send.to_account_info().key.as_ref()],
            &delphor_oracle_aggregator::ID,
        );

        if *self.get_coin_data.to_account_info().key != get_coin_pda {
            msg!(
                "Invalid mint_send {}. Expected {}",
                self.mint_send.to_account_info().key(),
                self.get_coin_data.mint,
            );
            return Err(ProgramError::InvalidAccountData);
        }

        let (send_coin_pda, _bump_seed) = Pubkey::find_program_address(
            &[self.mint_receive.to_account_info().key.as_ref()],
            &delphor_oracle_aggregator::ID,
        );

        if *self.send_coin_data.to_account_info().key != send_coin_pda {
            msg!(
                "Invalid mint_receive {}. Expected {}",
                self.mint_receive.to_account_info().key(),
                self.send_coin_data.mint,
            );
            return Err(ProgramError::InvalidAccountData);
        }

        let token_price: u128 = (get_coin_price as u128 * (10000 - user_vault_to.buy_fee as u128)
            / 10000)
            * u128::pow(10, send_coin_decimals as u32)
            / (send_coin_price as u128 * (10000 + user_vault_from.sell_fee as u128) / 10000);
        // Calculate final amount with oracle price and fees
        let amount_to_send: u64 =
            ((swap_amount as u128 * token_price) / u128::pow(10, get_coin_decimals as u32)) as u64;

        if amount_to_send < min_amount {
            return Err(ErrorCode::InsufficientAmount.into());
        }

        if user_vault_from.amount < amount_to_send {
            return Err(ErrorCode::VaultInsufficientAmount.into());
        }

        if user_vault_to.max != 0 && user_vault_to.amount + swap_amount > user_vault_to.max {
            return Err(ErrorCode::ExceedsMaxAmount.into());
        }

        if user_vault_from.amount - amount_to_send < user_vault_from.min {
            return Err(ErrorCode::ExceedsMinAmount.into());
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

        let seeds: &[&[u8]] = &[b"store_auth", &[bump]];
        let signer = &[&seeds[..]];

        anchor_spl::token::transfer(
            CpiContext::new_with_signer(
                self.token_program.clone(),
                Transfer {
                    from: self.token_store_pda_from.to_account_info(),
                    to: self.send_token_to.to_account_info(),
                    authority: self.token_store_authority.to_account_info(),
                },
                signer,
            ),
            amount_to_send,
        )?;

        user_vault_to.amount += swap_amount;
        user_vault_from.amount -= amount_to_send;

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
    #[msg("Operation exceeds max balance to user_vault_to")]
    ExceedsMaxAmount,
    #[msg("Operation exceeds min balance to user_vault_from")]
    ExceedsMinAmount,
    #[msg("Vault from doesn't accept received token.")]
    VaultDoesntAcceptToken,
}
