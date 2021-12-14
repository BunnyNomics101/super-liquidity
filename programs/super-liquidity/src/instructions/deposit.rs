use crate::states::UserCoinVault;
use anchor_lang::prelude::*;

//-----------------------------------------------------
// Deposit Instruction
#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub coin_vault: AccountInfo<'info, UserCoinVault>,

    #[account(mut)]
    pub get_token_from: CpiAccount<'info, TokenAccount>,
    #[account(signer)]
    pub get_token_from_authority: AccountInfo<'info>, // owner or delegate_authority

    #[account()]
    pub token_store_pda: CpiAccount<'info, TokenAccount>,

    pub system_program: AccountInfo<'info>,
    pub token_program: AccountInfo<'info>,
}
impl<'info> Deposit<'info> {
    pub fn process(&mut self, amount: u64) -> ProgramResult {

        // check mint
        if get_token_from.mint != coin_vault.mint {
            msg!(
                "Invalid get_token_from.mint {}. Expected {}",
                get_token_from.mint,
                coin_vault.mint,
            );
            return Err(ProgramError::InvalidAccountData)
        }

        // if delegated, check delegated amount
        if *self.get_token_from_authority.key != self.get_token_from.owner {
            msg!(
                "invalid get_token_from owner/auth",
                );
            return Err(ProgramError::NotTheOwner);
        }

        if self.get_token_from.amount < amount {
                msg!(
                    "Requested to deposit {} but you have only {}",
                    _amount,
                    self.get_token_from.amount
                );
                return Err(ProgramError::InsufficientFunds);
            }
        }

        //TODO check token_store_pda == find_program_address(coin_vault.mint,"TSTORE").0

        spl_token::transfer(
            CpiContext::new(
                self.token_program.clone(),
                Transfer {
                    from: self.get_token_from.to_account_info(),
                    to: self.token_store_pda.to_account_info(),
                    authority: self.get_token_from_authority.clone(),
                },
            ),
            amount,
        )?;

        Ok(())
    }
}
