use crate::states::*;
use anchor_lang::prelude::*;
use anchor_spl::token::Mint;

#[derive(Accounts)]
pub struct InitUserLiquiidtyProvider<'info> {
    #[account(mut)]
    pub user_account: Signer<'info>,
    #[account(
        init,
        payer = user_account,
        space = 6168,
        seeds = [
            user_account.key().as_ref(),
            "liquidity_provider".as_bytes().as_ref()
        ],
        bump,
    )]
    pub user_vault: Account<'info, UserVault>,
    pub system_program: Program<'info, System>,
}
impl<'info> InitUserLiquiidtyProvider<'info> {
    pub fn process(&mut self, bump: u8) -> Result<()> {
        *self.user_vault = UserVault {
            bump,
            user: self.user_account.key(),
            vault_type: VaultType::LiquidityProvider,
            vaults: Vec::with_capacity(50),
        };
        Ok(())
    }
}

#[derive(Accounts)]
pub struct UpdateUserLiquidityProvider<'info> {
    #[account(
        seeds = [
            ADMIN_ADDRESS.as_ref(),
        ], 
        bump = global_state.bump
    )]
    pub global_state: Account<'info, GlobalState>,
    pub user_account: Signer<'info>,
    pub mint: Account<'info, Mint>,
    #[account(
        mut, 
        seeds = [
            user_account.key().as_ref(),
            "liquidity_provider".as_bytes().as_ref()
        ], 
        bump = user_vault.bump
    )]
    pub user_vault: Account<'info, UserVault>,
}
impl<'info> UpdateUserLiquidityProvider<'info> {
    #[access_control(check_token_position(&self.global_state, &self.mint, position))]
    pub fn process(
        &mut self,
        position: usize,
        buy_fee: u16,
        sell_fee: u16,
        min: u64,
        max: u64,
        receive_status: bool,
        provide_status: bool,
        limit_price_status: bool,
        limit_price: u64,
    ) -> Result<()> {
        let vault = &mut self.user_vault.vaults[position];
        vault.buy_fee = buy_fee;
        vault.sell_fee = sell_fee;
        vault.min = min;
        vault.max = max;
        vault.timestamp = Clock::get().unwrap().unix_timestamp as u32;
        vault.receive_status = receive_status;
        vault.provide_status = provide_status;
        vault.limit_price_status = limit_price_status;
        vault.limit_price = limit_price;
        Ok(())
    }
}

fn check_token_position(global_state: &GlobalState, mint: &Account<Mint>, position: usize) -> Result<()> {
    if global_state.tokens[position] != mint.key() {
        return err!(ErrorCode::InvalidTokenPosition);
    }
    Ok(())
}

#[derive(Accounts)]
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
pub struct UpdateUserPortfolio<'info> {
    pub user_account: Signer<'info>,
    pub mint: Account<'info, Mint>,
    #[account(mut, seeds = [
        user_account.key().as_ref(), mint.key().as_ref()
    ], bump = user_portfolio.bump)]
    pub user_portfolio: Account<'info, UserVault>,
}
impl<'info> UpdateUserPortfolio<'info> {
    pub fn process(
        &mut self,
        position: usize,
        buy_fee: u16,
        sell_fee: u16,
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

#[error_code]
pub enum ErrorCode {
    InvalidTokenPosition
}
