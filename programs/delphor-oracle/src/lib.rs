use anchor_lang::prelude::*;

declare_id!("CSLRinGydCdX4KZs1ngeRQHfdfh1g63g8wwCGUZ4r5j8");

#[program]
pub mod delphor_oracle {
    use super::*;
    pub fn initialize(ctx: Context<Initialize>) -> ProgramResult {
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
