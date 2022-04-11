use crate::states::*;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct InitUserLiquidityProvider<'info> {
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
impl<'info> InitUserLiquidityProvider<'info> {
    pub fn process(&mut self, bump: u8) -> Result<()> {
        *self.user_vault = UserVault {
            bump,
            user: self.user_account.key(),
            vault_type: VaultType::LiquidityProvider,
            vaults: vec![UserCoinVault{
                amount: 0,
                min: 0,
                max: 0,
                buy_fee: 0,
                sell_fee: 0,
                timestamp: 0,
                receive_status: false,
                provide_status: false,
                limit_price_status: false,
                limit_price: 0,
            }; 50],
        };
        Ok(())
    }
}

#[derive(Accounts)]
pub struct UpdateUserLiquidityProvider<'info> {
    pub user_account: Signer<'info>,
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
    pub fn process(
        &mut self,
        position: u8,
        buy_fee: u16,
        sell_fee: u16,
        min: u64,
        max: u64,
        receive_status: bool,
        provide_status: bool,
        limit_price_status: bool,
        limit_price: u64,
    ) -> Result<()> {
        let vault = &mut self.user_vault.vaults[position as usize];
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
    pub user_vault: Account<'info, UserVault>,
    pub system_program: Program<'info, System>,
}
impl<'info> InitUserPortfolio<'info> {
    pub fn process(&mut self, bump: u8) -> Result<()> {
        *self.user_vault = UserVault {
            bump,
            user: self.user_account.key(),
            vault_type: VaultType::PortfolioManager{ auto_fee: true, tolerance: 1000},
            vaults: vec![UserCoinVault{
                amount: 0,
                min: 0,
                max: 0,
                buy_fee: 0,
                sell_fee: 0,
                timestamp: 0,
                receive_status: true,
                provide_status: true,
                limit_price_status: false,
                limit_price: 0,
            }; 50],
        };
        Ok(())
    }
}

#[derive(Accounts)]
pub struct UpdateUserPortfolio<'info> {
    pub user_account: Signer<'info>,
    #[account(
        mut, 
        seeds = [
            user_account.key().as_ref(),
            "portfolio_manager".as_bytes().as_ref()
        ], 
        bump = user_vault.bump
    )]
    pub user_vault: Account<'info, UserVault>,
}
impl<'info> UpdateUserPortfolio<'info> {
    pub fn process(
        &mut self,
        position: u8,
        min: u64,
        max: u64,
        limit_price_status: bool,
        limit_price: u64,
    ) -> Result<()> {
        let vault = &mut self.user_vault.vaults[position as usize];

        require!(min <= 10000, ErrorCode::ExceedsBasisPoints);
        require!(max <= 10000, ErrorCode::ExceedsBasisPoints);

        vault.min = min;
        vault.max = max;
        vault.timestamp = Clock::get().unwrap().unix_timestamp as u32;
        vault.limit_price_status = limit_price_status;
        vault.limit_price = limit_price;
        Ok(())
    }
}

// ------------
// -- Errors --
// ------------

#[error_code]
pub enum ErrorCode {
    #[msg("Value must be in basis points.")]
    ExceedsBasisPoints,
}