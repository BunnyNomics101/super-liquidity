use crate::states::*;
use anchor_lang::prelude::*;
use anchor_spl::token::Mint;
use anchor_spl::token::{Token, TokenAccount, Transfer};
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
        user_vault_to.user.as_ref(), mint_receive.key().as_ref()
    ], bump = user_vault_from.bump)]
    pub user_vault_from: Box<Account<'info, UserCoinVault>>,
    #[account(mut, seeds = [
        user_vault_from.user.as_ref(), mint_send.key().as_ref()
    ], bump = user_vault_to.bump)]
    pub user_vault_to: Box<Account<'info, UserCoinVault>>,
    /// CHECK:
    #[account(mut)]
    pub token_store_authority: AccountInfo<'info>,
    // token user sends
    pub mint_send: Account<'info, Mint>,
    // token user wants
    #[account(constraint = mint_receive.key() != mint_send.key())]
    // Validates the tokens being swapped are differents
    pub mint_receive: Account<'info, Mint>,
    // Account where user have tokens
    #[account(mut, associated_token::mint = mint_send, associated_token::authority = get_token_from_authority)]
    pub get_token_from: Box<Account<'info, TokenAccount>>,
    // owner or delegate_authority
    pub get_token_from_authority: Signer<'info>,
    // User account to send tokens
    #[account(mut)]
    pub send_token_to: Box<Account<'info, TokenAccount>>,
    // PDA to withdraw tokens
    #[account(mut, associated_token::mint = mint_receive, associated_token::authority = token_store_authority)]
    pub token_store_pda_from: Box<Account<'info, TokenAccount>>,
    // PDA to deposit tokens
    #[account(mut, associated_token::mint = mint_send, associated_token::authority = token_store_authority)]
    pub token_store_pda_to: Box<Account<'info, TokenAccount>>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}
impl<'info> Swap<'info> {
    #[access_control(check_oracle_accounts(&self))]
    pub fn process(&mut self, swap_amount: u64, min_amount: u64, bump: u8) -> Result<()> {
        let get_coin_price = self.get_coin_data.price;
        let get_coin_decimals = self.get_coin_data.decimals;
        let send_coin_price = self.send_coin_data.price;
        let send_coin_decimals = self.send_coin_data.decimals;
        let user_vault_from = &mut self.user_vault_from;
        let user_vault_to = &mut self.user_vault_to;

        if !user_vault_from.provide_status {
            return err!(ErrorCode::VaultProvideOff);
        }

        if !user_vault_to.receive_status {
            return err!(ErrorCode::VaultRecieveOff);
        }

        if user_vault_from.limit_price_status && user_vault_from.limit_price > send_coin_price {
            return err!(ErrorCode::PriceUnderLimitPrice);
        }

        if user_vault_to.amount + swap_amount > user_vault_to.max {
            return err!(ErrorCode::ExceedsMaxAmount);
        }

        let token_price: u128 = (get_coin_price as u128 * (10000 - user_vault_to.buy_fee as u128)
            / 10000)
            * u128::pow(10, send_coin_decimals as u32)
            / (send_coin_price as u128 * (10000 + user_vault_from.sell_fee as u128) / 10000);
        // Calculate final amount with oracle price and fees
        let amount_to_send: u64 =
            ((swap_amount as u128 * token_price) / u128::pow(10, get_coin_decimals as u32)) as u64;

        if amount_to_send < min_amount {
            return err!(ErrorCode::InsufficientAmount);
        }

        if user_vault_from.amount < amount_to_send {
            return err!(ErrorCode::VaultInsufficientAmount);
        }

        if user_vault_from.amount - amount_to_send < user_vault_from.min {
            return err!(ErrorCode::ExceedsMinAmount);
        }

        anchor_spl::token::transfer(
            CpiContext::new(
                self.token_program.to_account_info().clone(),
                Transfer {
                    from: self.get_token_from.to_account_info(),
                    to: self.token_store_pda_to.to_account_info(),
                    authority: self.get_token_from_authority.to_account_info().clone(),
                },
            ),
            swap_amount,
        )?;

        let seeds: &[&[u8]] = &[b"store_auth", &[bump]];
        let signer = &[&seeds[..]];

        anchor_spl::token::transfer(
            CpiContext::new_with_signer(
                self.token_program.to_account_info().clone(),
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
        user_vault_from.timestamp = Clock::get().unwrap().unix_timestamp as u64;

        Ok(())
    }
}

fn check_oracle_accounts(accounts: &Swap) -> Result<()> {
    let (get_coin_pda, _bump_seed) = Pubkey::find_program_address(
        &[accounts.mint_send.to_account_info().key.as_ref()],
        &delphor_oracle_aggregator::ID,
    );

    if *accounts.get_coin_data.to_account_info().key != get_coin_pda {
        msg!(
            "Invalid mint_send {}. Expected {}",
            accounts.mint_send.to_account_info().key(),
            accounts.get_coin_data.mint,
        );
        return Err(ProgramError::InvalidAccountData.into());
    }

    let (send_coin_pda, _bump_seed) = Pubkey::find_program_address(
        &[accounts.mint_receive.to_account_info().key.as_ref()],
        &delphor_oracle_aggregator::ID,
    );

    if *accounts.send_coin_data.to_account_info().key != send_coin_pda {
        msg!(
            "Invalid mint_receive {}. Expected {}",
            accounts.mint_receive.to_account_info().key(),
            accounts.send_coin_data.mint,
        );
        return Err(ProgramError::InvalidAccountData.into());
    }
    Ok(())
}

// ------------
// -- Errors --
// ------------

#[error_code]
pub enum ErrorCode {
    #[msg("Final amount lower than min_amount.")]
    InsufficientAmount,
    #[msg("Vault insufficient balance.")]
    VaultInsufficientAmount,
    #[msg("Operation exceeds max balance to user_vault_to")]
    ExceedsMaxAmount,
    #[msg("Operation exceeds min balance to user_vault_from")]
    ExceedsMinAmount,
    #[msg("Vault from paused.")]
    VaultProvideOff,
    #[msg("Vault to paused.")]
    VaultRecieveOff,
    #[msg("Current price for token requested is under the vault from limit price.")]
    PriceUnderLimitPrice,
}
