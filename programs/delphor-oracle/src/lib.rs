use anchor_lang::prelude::*;
use mock_oracle::{CoinInfo};

declare_id!("DJkR4f9MY9NBYsJS1m2aXmhM97B1nW8fMVCcSAtsBdg8");

#[program]
pub mod delphor_oracle {
    use super::*;
    pub fn update_price(ctx: Context<UpdateCoinPrice>) -> ProgramResult {
        let coin_oracle1 = &mut ctx.accounts.coin_oracle1;
        let coin_oracle2 = &mut ctx.accounts.coin_oracle2;
        let coin_oracle3 = &mut ctx.accounts.coin_oracle3;
        let coin_price = &mut ctx.accounts.coin_price;

        // Exclude furthest price and average the other two
        let ab: u64 = coin_oracle1.price - coin_oracle2.price;
        let bc: u64 = coin_oracle2.price - coin_oracle3.price;
        let ca: u64 = coin_oracle3.price - coin_oracle1.price;

        if ab < bc && ab < ca {
            coin_price.price = (coin_oracle1.price + coin_oracle2.price) / 2;
        } else if bc < ab && bc < ca {
            coin_price.price = (coin_oracle2.price + coin_oracle3.price) / 2;
        } else{
            coin_price.price = (coin_oracle3.price + coin_oracle1.price) / 2;
        }
        
        Ok(())
    }
}

#[derive(Accounts)]
pub struct UpdateCoinPrice<'info> {
    #[account(owner = mock_oracle::ID)]
    coin_oracle1: Account<'info, CoinInfo>,
    coin_oracle2: Account<'info, CoinInfo>,
    coin_oracle3: Account<'info, CoinInfo>,
    coin_price: Account<'info, CoinInfo>
}