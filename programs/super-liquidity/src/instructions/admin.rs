use crate::states::*;
use anchor_lang::prelude::*;
use anchor_spl::token::Mint;

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
        space = 8 + core::mem::size_of::<GlobalState>() + 64 * 32, // 2048 bytes for 64 tokens
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
        *self.global_state = GlobalState {
            admin_account: self.admin_account.key(),
            bump,
            tokens: vec![],
        };
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
        mut,
        seeds = [
            admin_account.key().as_ref(),
        ],
        bump = global_state.bump,
    )]
    pub global_state: Account<'info, GlobalState>,
    pub mint: Account<'info, Mint>,
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
