//
// aggregates price data from delphor-oracle (Coingecko, Orca, Serum), Pyth & SwitchBoard
//

use anchor_lang::prelude::*;
use anchor_spl::token::Mint;
use delphor_oracle::CoinInfo;
use num::integer::Roots;
use pyth_client::{load_price, load_product, Price, PriceConf, PriceStatus, Product};
use std::{cmp, str};
use switchboard_program::{FastRoundResultAccountData, SwitchboardAccountType}; // 0.4.0

declare_id!("BSVnZFytqxNN5e9UVN434YRWEFXJdpQyyyB8QmXoXdd3");
// const MAX_SYMBOL_LEN: usize = 36;

#[program]
pub mod delphor_oracle_aggregator {
    use super::*;
    pub fn init_global_account(ctx: Context<InitGlobalAccount>, authority: Pubkey) -> Result<()> {
        *ctx.accounts.global_account = GlobalAccount {
            bump: *ctx.bumps.get("global_account").unwrap(),
            authority,
            tokens: vec![],
        };
        Ok(())
    }

    pub fn add_token(ctx: Context<AddToken>, decimals: u8, symbol: String) -> Result<()> {
        let switchboard_optimized_feed_account = &ctx.accounts.switchboard_optimized_feed_account;
        if switchboard_optimized_feed_account.key().to_string()
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

        let mut pyth_price_account = ctx.accounts.pyth_product_account.key();
        if pyth_price_account.to_string() != "11111111111111111111111111111111" {
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
            pyth_price_account = Pubkey::new(&pyth_product_data.px_acc.val);
        }

        ctx.accounts.global_account.tokens.push(TokenData {
            mint: ctx.accounts.mint.key(),
            price: 0,
            last_update_timestamp: 0,
            decimals,
            pyth_price_account,
            switchboard_optimized_feed_account: switchboard_optimized_feed_account.key(),
            symbol,
        });
        Ok(())
    }
    
    pub fn update_token_price(ctx: Context<UpdateCoinPrice>, position: u8) -> Result<()> {
        let token_data = &mut ctx.accounts.global_account.tokens[position as usize];
        let delphor_oracle = &mut ctx.accounts.delphor_oracle;

        let mut switchboard_price: u64 = delphor_oracle.coin_gecko_price;
        if token_data.switchboard_optimized_feed_account.to_string()
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
        if token_data.pyth_price_account.to_string() != "11111111111111111111111111111111" {
            let pyth_price_result =
                get_pyth_price(&ctx.accounts.pyth_price_account, token_data.decimals);
            match pyth_price_result {
                Ok(price) => pyth_price = price,
                Err(error) => return Err(error),
            }
        }

        let calculate_price_result = calculate_price(
            delphor_oracle.coin_gecko_price,
            delphor_oracle.orca_price,
            delphor_oracle.serum_price,
            pyth_price,
            switchboard_price,
        );
        match calculate_price_result {
            Ok(price) => token_data.price = price,
            Err(error) => return Err(error),
        }

        token_data.last_update_timestamp = Clock::get().unwrap().unix_timestamp as u64;

        Ok(())
    }
}

pub fn check_token_position(
    global_state: &GlobalAccount,
    mint: &Pubkey,
    position: u8,
) -> Result<()> {
    if global_state.tokens[position as usize].mint != *mint {
        return err!(ErrorCode::InvalidTokenPosition);
    }
    Ok(())
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

fn calculate_price(v1: u64, v2: u64, v3: u64, v4: u64, v5: u64) -> Result<u64> {
    let mut values = vec![v1, v2, v3, v4, v5];
    insertion_sort(&mut values);

    let min_set = vec![values[0], values[1], values[2]];
    let mid_set = vec![values[1], values[2], values[3]];
    let max_set = vec![values[2], values[3], values[4]];

    let vc_lower_salues = variation_coefficient(&min_set);
    let vc_mid_values = variation_coefficient(&mid_set);
    let vc_upper_values = variation_coefficient(&max_set);

    let min_vc = cmp::min(vc_lower_salues, cmp::min(vc_mid_values, vc_upper_values));
    if min_vc > 5 {
        msg!("{}", min_vc);
        return Err(error!(ErrorCode::PriceUpdateError));
    }
    if min_vc == vc_lower_salues {
        return Ok(average(&min_set));
    } else if min_vc == vc_mid_values {
        return Ok(average(&mid_set));
    } else if min_vc == vc_upper_values {
        return Ok(average(&max_set));
    } else {
        // This should never happen
        return Err(error!(ErrorCode::UnexpectedError));
    }
}

fn insertion_sort(arr: &mut Vec<u64>) {
    for i in 1..arr.len() {
        let mut j = i;
        while j > 0 && arr[j - 1] > arr[j] {
            arr.swap(j - 1, j);
            j -= 1;
        }
    }
}

fn average(arr: &Vec<u64>) -> u64 {
    // TODO should I put a validation for length?
    let mut sum = 0;
    for x in arr {
        sum += x;
    }
    return sum / (arr.len() as u64);
}

fn std_dev(arr: &Vec<u64>) -> u64 {
    // TODO should I put a validation for length?
    let average = average(arr);
    let mut sum = 0;
    for x in arr {
        let low = *cmp::min(x, &average) as u128;
        let high = *cmp::max(x, &average) as u128;
        sum += (high - low).pow(2);
    }
    let std_dev_squared = sum / ((arr.len() - 1) as u128);
    return std_dev_squared.sqrt() as u64;
}

// The expected value is 0.5%. Mutiply by 100 to remove the percentage and by 1000 to also avoid 0 values
// since in u64, 0.5==0
fn variation_coefficient(arr: &Vec<u64>) -> u64 {
    let average = average(arr);
    let std_dev = std_dev(arr);
    msg!("Average: {}", average);
    msg!("Std dev: {}", std_dev);
    return std_dev * 1000 / average;
}

pub static ADMIN_ADDRESS: &str = "2kKx9xZB85wAbpvXLBui78jVZhPBuY3BxZ5Mad9d94h5";

#[derive(Accounts)]
#[instruction(position: u8)]
pub struct UpdateCoinPrice<'info> {
    /// CHECK:
    #[account(constraint = switchboard_optimized_feed_account.key() == global_account.tokens[position as usize].switchboard_optimized_feed_account)]
    switchboard_optimized_feed_account: AccountInfo<'info>,
    /// CHECK:
    #[account(constraint = pyth_price_account.key() == global_account.tokens[position as usize].pyth_price_account)]
    pyth_price_account: AccountInfo<'info>,
    // struct CoinInfo is imported from delphor-oracle, so the owner MUST be delphor-oracle
    // no need for additional checks
    #[account(constraint = delphor_oracle.symbol == global_account.tokens[position as usize].symbol)]
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
pub struct AddToken<'info> {
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
        space = 10240,
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
    pub tokens: Vec<TokenData>,
}

#[derive(Default, Clone, AnchorSerialize, AnchorDeserialize)]
pub struct TokenData {
    pub mint: Pubkey,
    pub price: u64,
    pub last_update_timestamp: u64,
    pub decimals: u8,
    pub pyth_price_account: Pubkey,
    pub switchboard_optimized_feed_account: Pubkey,
    pub symbol: String,
}

#[error_code]
pub enum ErrorCode {
    InvalidTokenPosition,
    TokenAlreadyExists,
    #[msg("Pyth accounts don't match.")]
    PythPriceAccountError,
    #[msg("Pyth product account don't contains expected symbol.")]
    PythProductAccountError,
    #[msg("Switchboard accounts don't match.")]
    SwitchboardAccountError,
    #[msg("The variation of prices is too high")]
    PriceUpdateError,
    #[msg("An unexpected error has ocurred")]
    UnexpectedError,
}
