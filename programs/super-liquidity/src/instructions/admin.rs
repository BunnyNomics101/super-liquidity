use crate::states::*;
use anchor_lang::prelude::*;
use anchor_spl::token::Mint;
use anchor_spl::token::{InitializeAccount, Token, TokenAccount};

#[derive(Accounts)]
#[instruction()]
pub struct InitGlobalState<'info> {
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
impl<'info> InitGlobalState<'info> {
    pub fn process(&mut self, bump: u8) -> Result<()> {
        self.global_state.admin_account = *self.admin_account.key;
        self.global_state.bump = bump;
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction()]
pub struct AddToken<'info> {
    // admin account
    #[account(mut)]
    pub admin_account: Signer<'info>,

    // Global state, create PDA
    #[account(
        seeds = [
            admin_account.key().as_ref(),
        ],
        bump = global_state.bump,
    )]
    pub global_state: Account<'info, GlobalState>,
    pub mint: Account<'info, Mint>,
    pub system_program: Program<'info, System>,
}
impl<'info> AddToken<'info> {
    pub fn process(&mut self) -> Result<()> {
        if self.global_state.tokens.contains(&self.mint.key()) {
            return err!(ErrorCode::TokenAlreadyAdded);
        }
        self.global_state.tokens.push(self.mint.key());
        Ok(())
    }
}

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

#[error_code]
pub enum ErrorCode {
    TokenAlreadyAdded,
}
