use anchor_lang::prelude::*;
use anchor_spl::token::Mint;

//-----------------------------------------------------
pub fn get_admin() -> Pubkey {
    return "2kKx9xZB85wAbpvXLBui78jVZhPBuY3BxZ5Mad9d94h5"
        .parse()
        .unwrap();
}

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
    PortfolioManager { auto_fee: bool, tolerance: u16 },
    LiquidityProvider,
}
impl Default for VaultType {
    fn default() -> Self {
        VaultType::PortfolioManager {
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

#[derive(Default, Clone, AnchorSerialize, AnchorDeserialize)]
pub struct UserCoinVault {
    pub amount: u64,
    pub min: u64,      // token amount for LP, percentage for portfolio
    pub max: u64,      // token amount for LP, percentage for portfolio
    pub buy_fee: u16,  // 0 for portfolio
    pub sell_fee: u16, // 0 for portfolio
    pub timestamp: u32,
    pub receive_status: bool, // always true for portfolio manager
    pub provide_status: bool, // always true for portfolio manager
    pub limit_price_status: bool,
    pub limit_price: u64,
}
impl UserCoinVault {}

//-----------------------------------------------------

pub fn check_token_position(
    global_state: &GlobalState,
    mint: &Account<Mint>,
    position: u8,
) -> Result<()> {
    if global_state.tokens[position as usize] != mint.key() {
        return err!(ErrorCode::InvalidTokenPosition);
    }
    Ok(())
}

pub fn check_vault(user: &Pubkey, user_vault: &Account<UserVault>) -> Result<()> {
    let (portfolio_pda, portfolio_bump) =
        Pubkey::find_program_address(&[user.as_ref(), "portfolio_manager".as_ref()], &crate::ID);
    let (liquidity_provider_pda, liquidity_provider_bump) =
        Pubkey::find_program_address(&[user.as_ref(), "liquidity_provider".as_ref()], &crate::ID);
    if (user_vault.key() == portfolio_pda && user_vault.bump == portfolio_bump)
        || (user_vault.key() == liquidity_provider_pda
            && user_vault.bump == liquidity_provider_bump)
    {
        return Ok(());
    }
    return err!(ErrorCode::InvalidVaultAccount);
}

#[error_code]
pub enum ErrorCode {
    InvalidTokenPosition,
    InvalidVaultAccount,
}
