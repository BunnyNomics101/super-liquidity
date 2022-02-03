use anchor_lang::prelude::*;
use anchor_spl::token::Mint;
use mock_oracle::CoinInfo;

declare_id!("DJkR4f9MY9NBYsJS1m2aXmhM97B1nW8fMVCcSAtsBdg8");
const MAX_SYMBOL_LEN: usize = 36;

#[program]
pub mod delphor_oracle {
    use super::*;
    pub fn update_coin_price(ctx: Context<UpdateCoinPrice>) -> ProgramResult {
        let coin_oracle1 = &mut ctx.accounts.coin_oracle1;
        let coin_oracle2 = &mut ctx.accounts.coin_oracle2;
        let coin_oracle3 = &mut ctx.accounts.coin_oracle3;
        let coin_data = &mut ctx.accounts.coin_data;

        // Exclude furthest price and average the other two
        let ab: u64 = coin_oracle1.price - coin_oracle2.price;
        let bc: u64 = coin_oracle2.price - coin_oracle3.price;
        let ca: u64 = coin_oracle3.price - coin_oracle1.price;

        if ab < bc && ab < ca {
            coin_data.price = (coin_oracle1.price + coin_oracle2.price) / 2;
        } else if bc < ab && bc < ca {
            coin_data.price = (coin_oracle2.price + coin_oracle3.price) / 2;
        } else {
            coin_data.price = (coin_oracle3.price + coin_oracle1.price) / 2;
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
        coin_data.symbol = symbol;
        coin_data.mint = *mint.to_account_info().key;
        coin_data.authority = *authority.key;
        coin_data.decimals = decimals;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct UpdateCoinPrice<'info> {
    #[account(owner = mock_oracle::ID)]
    coin_oracle1: Account<'info, CoinInfo>,
    #[account(owner = mock_oracle::ID)]
    coin_oracle2: Account<'info, CoinInfo>,
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
        init,
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
}
