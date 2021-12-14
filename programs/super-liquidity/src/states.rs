use anchor_lang::prelude::*;
use delphor_finance::{calc::proportional, error::CommonError, Fee};

//-----------------------------------------------------
///delphor-user-program PDA
#[state]
pub struct GlobalState {
    // Authority (admin address)
    pub admin_account: Pubkey,
}

//-----------------------------------------------------
pub struct CoinInfo {
    pub mint: Pubkey,
    pub min: u64,
    pub max: u64,
}

//-----------------------------------------------------
#[account]
pub struct UserVault {
    pub coins: Vec<CoinInfo>,

    pub buy_fee: u32,
    pub sell_fee: u32,

    // pause operations
    pub pause: bool,
}
impl UserVault {}

//-----------------------------------------------------
