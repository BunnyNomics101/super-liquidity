use anchor_lang::prelude::*;
use anchor_spl::token::Mint;
use mock_oracle::CoinInfo;
use pyth_client::{load_price, load_product, Price, PriceConf, PriceStatus, Product};
use std::{cmp, str};
use switchboard_program::{FastRoundResultAccountData, SwitchboardAccountType};

declare_id!("DJkR4f9MY9NBYsJS1m2aXmhM97B1nW8fMVCcSAtsBdg8");
const MAX_SYMBOL_LEN: usize = 36;

#[program]
pub mod delphor_oracle {
    use super::*;
    pub fn update_coin_price(ctx: Context<UpdateCoinPrice>) -> ProgramResult {
        let coin_data = &mut ctx.accounts.coin_data;
        let coin_oracle3 = &mut ctx.accounts.coin_oracle3;

        // Switchboard
        let mut switchboard_price: u64 = coin_data.price;
        if coin_data
            .switchboard_optimized_feed_account
            .key()
            .to_string()
            != "11111111111111111111111111111111"
        {
            if coin_data.switchboard_optimized_feed_account.key()
                != ctx.accounts.switchboard_optimized_feed_account.key()
            {
                msg!(
                    "Expected switchboard account: {:?}",
                    coin_data.switchboard_optimized_feed_account.key()
                );
                msg!(
                    "Received: {:?}",
                    ctx.accounts.switchboard_optimized_feed_account.key()
                );
                return Err(ErrorCode::SwitchboardAccountError.into());
            }
            let switchboard_optimized_feed_account =
                &ctx.accounts.switchboard_optimized_feed_account;
            let mut out = 0.0;
            let account_buf = switchboard_optimized_feed_account.try_borrow_data()?;
            if account_buf.len() == 0 {
                msg!("The provided account is empty.");
                return Err(ProgramError::InvalidAccountData);
            }
            if account_buf[0]
                == SwitchboardAccountType::TYPE_AGGREGATOR_RESULT_PARSE_OPTIMIZED as u8
            {
                let feed_data = FastRoundResultAccountData::deserialize(&account_buf).unwrap();
                out = feed_data.result.result;
                switchboard_price = (out * u64::pow(10, 9) as f64) as u64;
            } else {
                return Err(ProgramError::InvalidAccountData);
            }
        }
        // ----------------- //

        // Pyth
        // Send 11111111111111111111111111111111 as pyth_product_account
        // if pyth don't track the price of the token
        let mut pyth_price: u64 = coin_data.price;
        if coin_data.pyth_price_account.key().to_string() != "11111111111111111111111111111111" {
            if coin_data.pyth_price_account.key() != ctx.accounts.pyth_price_account.key() {
                msg!(
                    "Expected price account: {:?}",
                    coin_data.pyth_price_account.key()
                );
                msg!("Received: {:?}", ctx.accounts.pyth_price_account.key());
                return Err(ErrorCode::PythPriceAccountError.into());
            }

            let pyth_price_account = &ctx.accounts.pyth_price_account.try_borrow_data().unwrap();
            let pyth_price_data: &Price = load_price(&pyth_price_account)?;
            if pyth_price_data.agg.status == PriceStatus::Trading {
                let pyth_price_conf_data: &PriceConf =
                    &pyth_price_data.get_current_price().unwrap();
                let pyth_expo = pyth_price_conf_data.expo.abs() as u8;
                if pyth_price_conf_data.price < 0 {
                    pyth_price = 0;
                } else {
                    pyth_price = pyth_price_conf_data.price as u64;
                }
                if pyth_expo < coin_data.decimals {
                    pyth_price = pyth_price * u64::pow(10, (coin_data.decimals - pyth_expo) as u32);
                } else if pyth_expo > coin_data.decimals {
                    pyth_price = pyth_price / u64::pow(10, (pyth_expo - coin_data.decimals) as u32);
                }
            }
        }
        // ------------------- //

        let low = cmp::min(pyth_price, cmp::min(switchboard_price, coin_oracle3.price));
        let max = cmp::max(pyth_price, cmp::max(switchboard_price, coin_oracle3.price));
        let mid = pyth_price + switchboard_price + coin_oracle3.price - low - max;
        // Exclude furthest price and average the other two
        let ab: u64 = max - mid;
        let bc: u64 = mid - low;
        let ca: u64 = max - low;

        if ab < bc && ab < ca {
            coin_data.price = (max + mid) / 2;
        } else if bc < ab && bc < ca {
            coin_data.price = (mid + low) / 2;
        } else {
            coin_data.price = (low + max) / 2;
        }

        Ok(())
    }

    // Deserialization error in borsh with the order of the parameters.
    // String must be the last.
    pub fn init_coin(
        ctx: Context<InitCoinPrice>,
        bump: u8,
        decimals: u8,
        symbol: String,
    ) -> ProgramResult {
        let coin_data = &mut ctx.accounts.coin_data;
        let mint = &ctx.accounts.mint;
        let authority = &ctx.accounts.authority;

        let switchboard_optimized_feed_account = &ctx.accounts.switchboard_optimized_feed_account;
        if ctx
            .accounts
            .switchboard_optimized_feed_account
            .key()
            .to_string()
            != "11111111111111111111111111111111"
        {
            let account_buf = switchboard_optimized_feed_account.try_borrow_data()?;
            if account_buf.len() == 0 {
                msg!("The provided switchboard account is empty.");
                return Err(ProgramError::InvalidAccountData);
            }
            if account_buf[0]
                != SwitchboardAccountType::TYPE_AGGREGATOR_RESULT_PARSE_OPTIMIZED as u8
            {
                return Err(ProgramError::InvalidAccountData);
            }
        }
        if ctx.accounts.pyth_product_account.key().to_string() != "11111111111111111111111111111111"
        {
            let pyth_product_account =
                &ctx.accounts.pyth_product_account.try_borrow_data().unwrap();
            let pyth_product_data: &Product = load_product(&pyth_product_account).unwrap();
            let pyth_product_metadata = match str::from_utf8(&pyth_product_data.attr) {
                Ok(v) => v,
                Err(e) => panic!("Invalid UTF-8 sequence: {}", e),
            };
            msg!("{}", pyth_product_metadata);
            if !pyth_product_metadata.contains(&format!("{}/USD", &symbol)) {
                msg!("Expected product accouunt with symbol: {}", symbol);
                msg!("Received: {}", pyth_product_metadata);
                return Err(ErrorCode::PythProductAccountError.into());
            }
            coin_data.pyth_price_account = Pubkey::new(&pyth_product_data.px_acc.val);
        } else {
            coin_data.pyth_price_account = ctx.accounts.pyth_product_account.key();
        }

        coin_data.switchboard_optimized_feed_account = *ctx
            .accounts
            .switchboard_optimized_feed_account
            .to_account_info()
            .key;
        coin_data.symbol = symbol;
        coin_data.mint = *mint.to_account_info().key;
        coin_data.authority = *authority.key;
        coin_data.decimals = decimals;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct UpdateCoinPrice<'info> {
    switchboard_optimized_feed_account: AccountInfo<'info>,
    pyth_price_account: AccountInfo<'info>,
    #[account(owner = mock_oracle::ID)]
    coin_oracle3: Account<'info, CoinInfo>,
    #[account(mut)]
    coin_data: Account<'info, CoinData>,
    payer: Signer<'info>,
    system_program: AccountInfo<'info>,
}

#[derive(Accounts)]
#[instruction(bump: u8)]
pub struct InitCoinPrice<'info> {
    #[account(
        init_if_needed,
        payer = payer,
        space = 32+32+64+64+8+MAX_SYMBOL_LEN,
        seeds = [
            mint.key().as_ref()
        ],
        bump = bump,
    )]
    coin_data: Account<'info, CoinData>,
    mint: Account<'info, Mint>,
    authority: AccountInfo<'info>,
    switchboard_optimized_feed_account: AccountInfo<'info>,
    pyth_product_account: AccountInfo<'info>,
    payer: Signer<'info>,
    system_program: AccountInfo<'info>,
}

#[account]
#[derive(Default)]
pub struct CoinData {
    pub mint: Pubkey,
    pub authority: Pubkey,
    pub price: u64,
    pub last_update_timestamp: u64,
    pub symbol: String,
    pub decimals: u8,
    pub pyth_price_account: Pubkey,
    pub switchboard_optimized_feed_account: Pubkey,
}

#[error]
pub enum ErrorCode {
    #[msg("Pyth accounts don't match.")]
    PythPriceAccountError,
    #[msg("Pyth product account don't contains expected symbol.")]
    PythProductAccountError,
    #[msg("Switchboard accounts don't match.")]
    SwitchboardAccountError,
}
