use anchor_lang::prelude::*;
use anchor_spl::token::Mint;
use delphor_oracle::CoinInfo;
use pyth_client::{load_price, load_product, Price, PriceConf, PriceStatus, Product};
use std::{cmp, str};
use switchboard_program::{FastRoundResultAccountData, SwitchboardAccountType};

declare_id!("HbyTY89Se2c8Je7KDKHVjUEGN2sAruFAw3S3NwubzeyU");
const MAX_SYMBOL_LEN: usize = 36;

#[program]
pub mod delphor_oracle_aggregator {
    use super::*;
    pub fn update_coin_price(ctx: Context<UpdateCoinPrice>) -> Result<()> {
        let coin_data = &mut ctx.accounts.coin_data;
        let delphor_oracle = &mut ctx.accounts.delphor_oracle;

        let mut switchboard_price: u64 = delphor_oracle.coin_gecko_price;
        if coin_data.switchboard_optimized_feed_account.to_string()
            != "11111111111111111111111111111111"
        {
            let switchboard_price_result =
                get_switchboard_price(&ctx.accounts.switchboard_optimized_feed_account);
            match switchboard_price_result {
                Ok(price) => switchboard_price = price,
                Err(error) => return Err(error),
            }
        }
        let mut pyth_price: u64 = delphor_oracle.coin_gecko_price;
        if coin_data.pyth_price_account.to_string() != "11111111111111111111111111111111" {
            let pyth_price_result =
                get_pyth_price(&ctx.accounts.pyth_price_account, coin_data.decimals);
            match pyth_price_result {
                Ok(price) => pyth_price = price,
                Err(error) => return Err(error),
            }
        }

        coin_data.price = calculate_price(
            &delphor_oracle.coin_gecko_price,
            &pyth_price,
            &switchboard_price,
        );

        Ok(())
    }

    // Deserialization error in borsh with the order of the parameters.
    // String must be the last.
    pub fn init_coin(ctx: Context<InitGlobalAccount>, decimals: u8, symbol: String) -> Result<()> {
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
                return Err(ProgramError::InvalidAccountData.into());
            }
            if account_buf[0]
                != SwitchboardAccountType::TYPE_AGGREGATOR_RESULT_PARSE_OPTIMIZED as u8
            {
                return Err(ProgramError::InvalidAccountData.into());
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
                return Err(error!(ErrorCode::PythProductAccountError));
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

fn get_switchboard_price(switchboard_account: &AccountInfo<'_>) -> Result<u64> {
    let account_buf = switchboard_account.try_borrow_data()?;
    if account_buf.len() == 0 {
        msg!("The provided account is empty.");
        return Err(ProgramError::InvalidAccountData.into());
    }
    if account_buf[0] != SwitchboardAccountType::TYPE_AGGREGATOR_RESULT_PARSE_OPTIMIZED as u8 {
        return Err(ProgramError::InvalidAccountData.into());
    }
    let feed_data = FastRoundResultAccountData::deserialize(&account_buf).unwrap();
    return Ok((feed_data.result.result * u64::pow(10, 9) as f64) as u64);
}

fn get_pyth_price(pyth_account: &AccountInfo<'_>, decimals: u8) -> Result<u64> {
    let mut pyth_price: u64 = 0;
    let pyth_price_account = &pyth_account.try_borrow_data().unwrap();
    let pyth_price_data: &Price = load_price(&pyth_price_account).unwrap();
    if pyth_price_data.agg.status == PriceStatus::Trading {
        let pyth_price_conf_data: &PriceConf = &pyth_price_data.get_current_price().unwrap();
        let pyth_expo = pyth_price_conf_data.expo.abs() as u8;
        if pyth_price_conf_data.price < 0 {
            pyth_price = 0;
        } else {
            pyth_price = pyth_price_conf_data.price as u64;
        }
        if pyth_expo < decimals {
            pyth_price = pyth_price * u64::pow(10, (decimals - pyth_expo) as u32);
        } else if pyth_expo > decimals {
            pyth_price = pyth_price / u64::pow(10, (pyth_expo - decimals) as u32);
        }
    }
    Ok(pyth_price)
}

fn calculate_price(price_a: &u64, price_b: &u64, price_c: &u64) -> u64 {
    let low = cmp::min(price_b, cmp::min(price_c, price_a));
    let max = cmp::max(price_b, cmp::max(price_c, price_a));
    let mid = price_b + price_c + price_a - low - max;
    // Exclude furthest price and average the other two
    let ab: u64 = max - mid;
    let bc: u64 = mid - low;
    let ca: u64 = max - low;

    if ab < bc && ab < ca {
        return (max + mid) / 2;
    } else if bc < ab && bc < ca {
        return (mid + low) / 2;
    } else {
        return (low + max) / 2;
    }
}

pub static ADMIN_ADDRESS: &str = "2kKx9xZB85wAbpvXLBui78jVZhPBuY3BxZ5Mad9d94h5";

#[derive(Accounts)]
#[instruction(position: usize)]
pub struct UpdateCoinPrice<'info> {
    #[account(constraint = switchboard_optimized_feed_account.key() == global_account.tokens_data[position].switchboard_optimized_feed_account)]
    switchboard_optimized_feed_account: AccountInfo<'info>,
    #[account(constraint = pyth_price_account.key() == global_account.tokens_data[position].pyth_price_account)]
    pyth_price_account: AccountInfo<'info>,
    // struct CoinInfo is imported from delphor-oracle, so the owner MUST be delphor-oracle
    // no need for additional checks
    delphor_oracle: Account<'info, CoinInfo>,
    #[account(
        mut,
        seeds = [
            authority.key().as_ref()
        ],
        bump = global_account.bump,
    )]
    global_account: Account<'info, GlobalAccount>,
    authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct InitTokenData<'info> {
    #[account(
        mut,
        seeds = [
            authority.key().as_ref()
        ],
        bump = global_account.bump,
    )]
    global_account: Account<'info, GlobalAccount>,
    mint: Account<'info, Mint>,
    authority: Signer<'info>,
    /// CHECK:
    switchboard_optimized_feed_account: AccountInfo<'info>,
    /// CHECK:
    pyth_product_account: AccountInfo<'info>,
}

#[derive(Accounts)]
#[instruction(authority: Pubkey)]
pub struct InitGlobalAccount<'info> {
    #[account(
        init,
        payer = payer,
        space = 32+32+64+64+8+MAX_SYMBOL_LEN,
        seeds = [
            authority.as_ref()
        ],
        bump,
    )]
    global_account: Account<'info, GlobalAccount>,
    #[account(mut, constraint = payer.key().to_string() == ADMIN_ADDRESS)]
    payer: Signer<'info>,
    system_program: Program<'info, System>,
}

#[account]
#[derive(Default)]
pub struct GlobalAccount {
    pub bump: u8,
    pub authority: Pubkey,
    pub tokens_data: Vec<TokenData>,
}

#[account]
#[derive(Default)]
struct TokenData {
    pub mint: Pubkey,
    pub price: u64,
    pub last_update_timestamp: u64,
    pub symbol: String,
    pub decimals: u8,
    pub pyth_price_account: Pubkey,
    pub switchboard_optimized_feed_account: Pubkey,
}

#[error_code]
pub enum ErrorCode {
    TokenAlreadyExists,
    #[msg("Pyth accounts don't match.")]
    PythPriceAccountError,
    #[msg("Pyth product account don't contains expected symbol.")]
    PythProductAccountError,
    #[msg("Switchboard accounts don't match.")]
    SwitchboardAccountError,
}
