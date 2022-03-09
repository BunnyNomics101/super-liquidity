use anchor_lang::prelude::*;

//-----------------------------------------------------
///delphor-user-program PDA
#[account]
#[derive(Default)]
pub struct GlobalState {
    pub bump: u8,
    // Authority (admin address)
    pub admin_account: Pubkey,
}


//-----------------------------------------------------
#[account]
#[derive(Default)]
pub struct UserPortfolio {
    pub bump: u8,
    pub vaults: Vec<UserCoinVault>
}
impl UserPortfolio {}

#[account]
#[derive(Default)]
pub struct UserCoinVault {
    pub bump: u8,
    pub user: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
    pub min: u64,
    pub max: u64,
    pub buy_fee: u8,
    pub sell_fee: u8,
    pub timestamp: u32,
    pub receive_status: bool,
    pub provide_status: bool,
    pub limit_price_status: bool,
    pub limit_price: u64,
}
impl UserCoinVault {}

//-----------------------------------------------------
