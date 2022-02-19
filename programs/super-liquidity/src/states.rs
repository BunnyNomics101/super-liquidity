use anchor_lang::prelude::*;

//-----------------------------------------------------
///delphor-user-program PDA
#[account]
#[derive(Default)]
pub struct GlobalState {
    // Authority (admin address)
    pub admin_account: Pubkey,
}


//-----------------------------------------------------
#[account]
#[derive(Default)]
pub struct UserCoinVault {
    pub bump: u8,
    pub user: Pubkey,
    pub mint: Pubkey,
    pub swap_to: Vec<Pubkey>,
    pub amount: u64,
    pub min: u64,
    pub max: u64,
    pub buy_fee: u32,
    pub sell_fee: u32,

    // pause operations
    pub pause: bool,
}
impl UserCoinVault {}

//-----------------------------------------------------
