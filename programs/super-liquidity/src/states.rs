use anchor_lang::prelude::*;

//-----------------------------------------------------
pub static ADMIN_ADDRESS: &str = "2kKx9xZB85wAbpvXLBui78jVZhPBuY3BxZ5Mad9d94h5";

///delphor-user-program PDA
#[account]
#[derive(Default)]
pub struct GlobalState {
    pub bump: u8,
    // Authority (admin address)
    pub admin_account: Pubkey,
    pub tokens: Vec<Pubkey>,
}

//-----------------------------------------------------
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub enum VaultType {
    Portfolio { auto_fee: bool, tolerance: u16 },
    LiquidityProvider,
}
impl Default for VaultType {
    fn default() -> Self {
        VaultType::Portfolio {
            auto_fee: true,
            tolerance: 1000,
        };
        VaultType::LiquidityProvider
    }
}

#[account]
#[derive(Default)]
pub struct UserVault {
    pub bump: u8,
    pub user: Pubkey,
    pub vault_type: VaultType,
    pub vaults: Vec<UserCoinVault>,
}
impl UserVault {}

#[account]
#[derive(Default)]
struct UserCoinVault {
    pub amount: u64,
    pub min: u64,
    pub max: u64,
    pub buy_fee: u16,
    pub sell_fee: u16,
    pub timestamp: u32,
    pub receive_status: bool,
    pub provide_status: bool,
    pub limit_price_status: bool,
    pub limit_price: u64,
}
impl UserCoinVault {}

//-----------------------------------------------------
