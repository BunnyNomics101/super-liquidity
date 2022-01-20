// #region code
use anchor_lang::prelude::*;

declare_id!("4Vpibjett44rWpFSVYu4McD2ujTYURwi3XX4Hjo6Ed3U");

const MAX_SYMBOL_LEN: usize = 36;

#[program]
pub mod mock_oracle {
    use super::*;

    /// creates a PDA account, owned by this program, where the PDA address is based on symbol
    /// also sets initial price
    pub fn create_coin(
        ctx: Context<CreateCoin>,
        price: u64,
        symbol: String,
        _pda_bump: u8,
    ) -> ProgramResult {
        assert!(
            symbol.len() < MAX_SYMBOL_LEN,
            "max symbol len is {}",
            MAX_SYMBOL_LEN
        );
        // set new account values
        let coin = &mut ctx.accounts.coin;
        coin.price = price;
        coin.last_update_timestamp = Clock::get().unwrap().unix_timestamp as u64;
        coin.authority = *ctx.accounts.authority.key;
        coin.symbol = symbol;

        // emit event
        emit!(NewCoinInfo {
            symbol: coin.symbol.clone(),
            price: coin.price,
            last_update_timestamp: coin.last_update_timestamp,
        });

        Ok(())
    }

    pub fn update_coin(ctx: Context<UpdateCoin>, price: u64) -> ProgramResult {
        let coin = &mut ctx.accounts.coin;
        if coin.authority != *ctx.accounts.authority.key {
            return Err(ErrorCode::Unauthorized.into());
        }
        coin.price = price;
        coin.last_update_timestamp = Clock::get().unwrap().unix_timestamp as u64;
        emit!(NewCoinInfo {
            symbol: coin.symbol.clone(),
            price: coin.price,
            last_update_timestamp: coin.last_update_timestamp,
        });
        Ok(())
    }

    pub fn delete_coin(ctx: Context<DeleteCoin>) -> ProgramResult {
        msg!("delete coin PDA");
        let coin = &mut ctx.accounts.coin;
        if coin.authority != *ctx.accounts.authority.key {
            return Err(ErrorCode::Unauthorized.into());
        }
        // mark account as deleted (tombstone mark, avoid re-use account attack)
        coin.symbol = "*DELETED*".into();
        // move all lamports to the payer,
        // the coin account will be deleted by the chain (no rent lamports)
        **ctx.accounts.payer.lamports.borrow_mut() = ctx
            .accounts
            .payer
            .lamports()
            .checked_add(coin.to_account_info().lamports())
            .ok_or(ProgramError::InvalidAccountData)?;
        **coin.to_account_info().lamports.borrow_mut() = 0;
        Ok(())
    }
}

// -----------------------------------
// -- Instruction Account Arguments --
// -----------------------------------
//
#[derive(Accounts)]
#[instruction(price:u64, symbol:String, pda_bump:u8)]
pub struct CreateCoin<'info> {
    #[account(init,payer=payer,seeds=[symbol.as_bytes().as_ref()],bump=pda_bump, space=8+8+32+ 4+MAX_SYMBOL_LEN)]
    coin: Account<'info, CoinInfo>,
    authority: AccountInfo<'info>,
    payer: Signer<'info>,
    system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateCoin<'info> {
    #[account(mut)]
    coin: Account<'info, CoinInfo>,
    authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct DeleteCoin<'info> {
    #[account(mut)]
    coin: Account<'info, CoinInfo>,
    authority: Signer<'info>,
    #[account(mut)]
    payer: Signer<'info>,
}

// ---------------------
// -- Account Structs --
// ---------------------
#[account]
#[derive(Default)]
pub struct CoinInfo {
    pub price: u64,
    pub last_update_timestamp: u64,
    pub authority: Pubkey,
    pub symbol: String,
}

// ------------
// -- Events --
// ------------
#[event]
pub struct NewCoinInfo {
    pub symbol: String,
    pub price: u64,
    pub last_update_timestamp: u64,
}
// #endregion code

// ------------
// -- Errors --
// ------------
// starts at 300 / 0x12c
#[error]
pub enum ErrorCode {
    #[msg("You are not authorized to perform this action.")]
    Unauthorized,
}