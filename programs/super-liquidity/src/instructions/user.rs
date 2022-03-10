use crate::states::*;
use anchor_lang::prelude::*;
use anchor_spl::token::Mint;

#[derive(Accounts)]
#[instruction()]
pub struct InitUserVault<'info> {
    // global state
    pub global_state: Account<'info, GlobalState>,

    // user account, signer
    #[account(mut)]
    pub user_account: Signer<'info>,

    // for what token
    pub mint: Account<'info, Mint>,

    // user vault, create PDA
    #[account(
        init,
        payer = user_account,
        space = 8 + core::mem::size_of::<UserCoinVault>() + 1280, // 1280 bytes future expansion
        seeds = [
            user_account.key().as_ref(),
            mint.key().as_ref(),
        ],
        bump,
    )]
    pub user_vault: Account<'info, UserCoinVault>,

    pub system_program: Program<'info, System>,
}
impl<'info> InitUserVault<'info> {
    #[allow(unused_variables)]
    pub fn process(
        &mut self,
        bump: u8,
        buy_fee: u16,
        sell_fee: u16,
        min: u64,
        max: u64,
        receive_status: bool,
        provide_status: bool,
        limit_price_status: bool,
        limit_price: u64,
    ) -> Result<()> {
        *self.user_vault = UserCoinVault {
            user: self.user_account.key(),
            mint: self.mint.key(),
            amount: 0,
            min,
            max,
            buy_fee,
            sell_fee,
            timestamp: Clock::get().unwrap().unix_timestamp as u32,
            receive_status: false,
            provide_status: false,
            limit_price_status: false,
            limit_price: 0,
        };
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction()]
pub struct InitUserPortfolio<'info> {
    // global state
    pub global_state: Account<'info, GlobalState>,

    // user account, signer
    #[account(mut)]
    pub user_account: Signer<'info>,

    // for what token
    pub mint: Account<'info, Mint>,

    // user vault, create PDA
    #[account(
        init,
        payer = user_account,
        space = 8 + core::mem::size_of::<UserCoinVault>() + 10800, // 10800 bytes future expansion
        seeds = [
            user_account.key().as_ref(),
            mint.key().as_ref(),
        ],
        bump,
    )]
    pub user_portfolio: Account<'info, UserPortfolio>,

    pub system_program: Program<'info, System>,
}
impl<'info> InitUserPortfolio<'info> {
    #[allow(unused_variables)]
    pub fn process(&mut self, bump: u8) -> Result<()> {
        *self.user_portfolio = UserPortfolio {
            bump,
            vaults: Vec::with_capacity(50),
        };
        Ok(())
    }
}

#[derive(Accounts)]
pub struct UpdateUserVault<'info> {
    pub user_account: Signer<'info>,
    pub mint: Account<'info, Mint>,
    #[account(mut, seeds = [
        user_account.key().as_ref(), mint.key().as_ref()
    ], bump = user_vault.bump)]
    pub user_vault: Account<'info, UserCoinVault>,
}
impl<'info> UpdateUserVault<'info> {
    pub fn process(
        &mut self,
        sell_fee: u16,
        buy_fee: u16,
        min: u64,
        max: u64,
        receive_status: bool,
        provide_status: bool,
        limit_price_status: bool,
        limit_price: u64,
    ) -> Result<()> {
        self.user_vault.sell_fee = sell_fee;
        self.user_vault.buy_fee = buy_fee;
        self.user_vault.min = min;
        self.user_vault.max = max;
        self.user_vault.timestamp = Clock::get().unwrap().unix_timestamp as u32;
        self.user_vault.receive_status = receive_status;
        self.user_vault.provide_status = provide_status;
        self.user_vault.limit_price_status = limit_price_status;
        self.user_vault.limit_price = limit_price;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct UpdateUserPortfolio<'info> {
    pub user_account: Signer<'info>,
    pub mint: Account<'info, Mint>,
    #[account(mut, seeds = [
        user_account.key().as_ref(), mint.key().as_ref()
    ], bump = user_portfolio.bump)]
    pub user_portfolio: Account<'info, UserPortfolio>,
}
impl<'info> UpdateUserPortfolio<'info> {
    pub fn process(
        &mut self,
        position: usize,
        sell_fee: u16,
        buy_fee: u16,
        min: u64,
        max: u64,
        receive_status: bool,
        provide_status: bool,
        limit_price_status: bool,
        limit_price: u64,
    ) -> Result<()> {
        self.user_portfolio.vaults[position].sell_fee = sell_fee;
        self.user_portfolio.vaults[position].buy_fee = buy_fee;
        self.user_portfolio.vaults[position].min = min;
        self.user_portfolio.vaults[position].max = max;
        self.user_portfolio.vaults[position].timestamp =
            Clock::get().unwrap().unix_timestamp as u32;
        self.user_portfolio.vaults[position].receive_status = receive_status;
        self.user_portfolio.vaults[position].provide_status = provide_status;
        self.user_portfolio.vaults[position].limit_price_status = limit_price_status;
        self.user_portfolio.vaults[position].limit_price = limit_price;
        Ok(())
    }
}