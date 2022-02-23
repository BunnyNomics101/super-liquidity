use anchor_lang::prelude::*;

#[error_code]
pub enum DelphorError {
    #[msg("Access denied")]
    AccessDenied,
    #[msg("Not the owner")]
    NotTheOwner,
}
