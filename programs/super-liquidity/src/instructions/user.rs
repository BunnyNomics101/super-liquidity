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

#[derive(Accounts)]
pub struct InitUserPortfolio<'info> {
    #[account(mut)]
    pub user_account: Signer<'info>,
    #[account(
        init,
        payer = user_account,
        space = 6168,
        seeds = [
            user_account.key().as_ref(),
            "portfolio_manager".as_bytes().as_ref()
        ],
        bump,
    )]
    pub user_portfolio: Account<'info, UserVault>,
    pub system_program: Program<'info, System>,
}
impl<'info> InitUserPortfolio<'info> {
    pub fn process(&mut self, bump: u8) -> Result<()> {
        *self.user_portfolio = UserVault {
            bump,
            user: self.user_account.key(),
            vault_type: VaultType::PortfolioManager{ auto_fee: true, tolerance: 1000},
            vaults: Vec::with_capacity(50),
        };
        Ok(())
    }
}

#[derive(Accounts)]
pub struct UpdateUserPortfolio<'info> {
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
            "portfolio_manager".as_bytes().as_ref()
        ], 
        bump = user_portfolio.bump
    )]
    pub user_portfolio: Account<'info, UserVault>,
}
impl<'info> UpdateUserPortfolio<'info> {
    #[access_control(check_token_position(&self.global_state, &self.mint, position))]
    pub fn process(
        &mut self,
        position: usize,
        min: u64,
        max: u64,
        receive_status: bool,
        provide_status: bool,
        limit_price_status: bool,
        limit_price: u64,
    ) -> Result<()> {
        let vault = &mut self.user_portfolio.vaults[position];
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

#[error_code]
pub enum ErrorCode {
    InvalidTokenPosition
}
