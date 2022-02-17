// #region code
use anchor_lang::prelude::*;

declare_id!("EfufQbaDxhhq693vUSaeKU2aKvxpwk114Fw3qTkM87Ke");

const MAX_SYMBOL_LEN: usize = 36;

#[program]
pub mod delphor_oracle {
    use super::*;

    /// creates a PDA account, owned by this program, where the PDA address is based on symbol
    /// also sets initial price
    pub fn create_coin(
        ctx: Context<CreateCoin>,
        coin_gecko_price: u64,
        orca_price: u64,
        _pda_bump: u8,
        symbol: String,
    ) -> ProgramResult {
        assert!(
            symbol.len() < MAX_SYMBOL_LEN,
            "max symbol len is {}",
            MAX_SYMBOL_LEN
        );
        // set new account values
        let coin = &mut ctx.accounts.coin;
        coin.coin_gecko_price = coin_gecko_price;
        coin.orca_price = orca_price;
        coin.last_update_timestamp = Clock::get().unwrap().unix_timestamp as u64;
        coin.authority = *ctx.accounts.authority.key;
        coin.symbol = symbol;

        // emit event
        emit!(NewCoinInfo {
            symbol: coin.symbol.clone(),
            coin_gecko_price: coin.coin_gecko_price,
            orca_price: coin.orca_price,
            last_update_timestamp: coin.last_update_timestamp,
        });

        Ok(())
    }

    pub fn update_coin(
        ctx: Context<UpdateCoin>,
        coin_gecko_price: u64,
        orca_price: u64,
    ) -> ProgramResult {
        let coin = &mut ctx.accounts.coin;
        if coin.authority != *ctx.accounts.authority.key {
            return Err(ErrorCode::Unauthorized.into());
        }
        coin.coin_gecko_price = coin_gecko_price;
        coin.orca_price = orca_price;
        coin.last_update_timestamp = Clock::get().unwrap().unix_timestamp as u64;
        emit!(NewCoinInfo {
            symbol: coin.symbol.clone(),
            coin_gecko_price: coin.coin_gecko_price,
            orca_price: coin.orca_price,
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
#[instruction(coin_gecko_price: u64,
    orca_price: u64, pda_bump:u8, symbol:String)]
pub struct CreateCoin<'info> {
    #[account(init,payer=payer,seeds=[symbol.as_bytes().as_ref()],bump=pda_bump, space=32+64+64+64+64+MAX_SYMBOL_LEN+128)]
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
    pub orca_price: u64,
    pub coin_gecko_price: u64,
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
    pub coin_gecko_price: u64,
    pub orca_price: u64,
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
