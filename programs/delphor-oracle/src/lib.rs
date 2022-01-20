use anchor_lang::prelude::*;
use mock_oracle::{CoinInfo};

declare_id!("CSLRinGydCdX4KZs1ngeRQHfdfh1g63g8wwCGUZ4r5j8");

#[program]
pub mod delphor_oracle {
    use super::*;
    pub fn update_price(ctx: Context<UpdateCoinPrice>) -> ProgramResult {
        let coin_oracle1 = &mut ctx.accounts.coin_oracle1;
        let coin_oracle2 = &mut ctx.accounts.coin_oracle2;
        let coin_oracle3 = &mut ctx.accounts.coin_oracle3;

        // Exclude furthest price and average the other two
        /*
        let ab: bool = coin_oracle1.price > coin_oracle2.price;
        let bc: bool = coin_oracle2.price > coin_oracle3.price;
        let ca: bool = coin_oracle3.price > coin_oracle1.price;

        if ca == ab {
            coin_price.price = 
        } else if ab == bc {

        } else{

        }
        */
        
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