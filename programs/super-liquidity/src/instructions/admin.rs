use crate::states::*;
use anchor_lang::prelude::*;
use anchor_spl::token::Mint;
use anchor_spl::token::{InitializeAccount, Token, TokenAccount};

//-----------------------------------------------------
#[derive(Accounts)]
#[instruction()]
pub struct Initialize<'info> {
    // admin account
    #[account(mut)]
    pub admin_account: Signer<'info>,

    // Global state, create PDA
    #[account(
        init,
        payer = admin_account,
        space = 8 + core::mem::size_of::<GlobalState>() + 128, // 128 bytes future expansion
        seeds = [
            admin_account.key().as_ref(),
        ],
        bump,
    )]
    pub global_state: Account<'info, GlobalState>,

    pub system_program: Program<'info, System>,
}
impl<'info> Initialize<'info> {
    #[allow(unused_variables)]
    pub fn process(&mut self, bump: u8) -> Result<()> {
        self.global_state.admin_account = *self.admin_account.key;
        Ok(())
    }
}

//-----------------------------------------------------
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
        space = 8 + core::mem::size_of::<UserCoinVault>() + 3600, // 3600 bytes future expansion
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
        buy_fee: u32,
        sell_fee: u32,
        swap_accounts: Vec<Pubkey>,
    ) -> Result<()> {
        *self.user_vault = UserCoinVault {
            bump,
            buy_fee,
            sell_fee,
            pause: false,
            user: self.user_account.key(),
            mint: self.mint.key(),
            swap_to: swap_accounts,
            amount: 0,
            min: 0,
            max: 0,
        };
        Ok(())
    }
}

//-----------------------------------------------------
#[derive(Accounts)]
pub struct InitTokenStore<'info> {
    // global state
    pub global_state: Account<'info, GlobalState>,

    // admin account, signer
    #[account(mut)]
    pub admin_account: Signer<'info>,

    // for what token
    pub mint: Account<'info, Mint>,
    /// CHECK:
    pub token_store_authority: AccountInfo<'info>,

    // token store, token account
    /// CHECK:
    #[account(
        init,
        payer = admin_account,
        space = core::mem::size_of::<TokenAccount>(),
        seeds = [
            global_state.key().as_ref(),
            mint.key().as_ref(),
        ],
        bump,
    )]
    pub token_store: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    /// CHECK:
    pub rent: AccountInfo<'info>,
}
impl<'info> InitTokenStore<'info> {
    #[allow(unused_variables)]
    pub fn process(&mut self) -> Result<()> {
        anchor_spl::token::initialize_account(CpiContext::new(
            self.token_program.to_account_info().clone(),
            InitializeAccount {
                account: self.token_store.to_account_info(),
                mint: self.mint.to_account_info(),
                authority: self.token_store_authority.clone(),
                rent: self.rent.to_account_info(),
            },
        ))?;

        Ok(())
    }
}

//--------------------------------------
#[derive(Accounts)]
pub struct ChangeAuthority<'info> {
    // global state
    #[account(mut, has_one = admin_account)]
    pub global_state: Account<'info, GlobalState>,

    // current admin account (must match the one in GlobalState)
    pub admin_account: Signer<'info>,

    // new admin account
    /// CHECK:
    pub new_admin_account: AccountInfo<'info>,
}
impl<'info> ChangeAuthority<'info> {
    pub fn process(&mut self) -> Result<()> {
        self.global_state.admin_account = *self.new_admin_account.key;
        Ok(())
    }
}

//-----------------------------------------------------
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
        sell_fee: u32,
        buy_fee: u32,
        min: u64,
        max: u64,
        swap_accounts: Vec<Pubkey>,
    ) -> Result<()> {
        self.user_vault.swap_to = swap_accounts;
        self.user_vault.sell_fee = sell_fee;
        self.user_vault.buy_fee = buy_fee;
        self.user_vault.min = min;
        self.user_vault.max = max;
        Ok(())
    }
}
