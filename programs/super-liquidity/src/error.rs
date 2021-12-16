use anchor_lang::prelude::*;

#[error]
pub enum DelphorError {
    #[msg("Access denied")]
    AccessDenied,
    #[msg("Not the owner")]
    NotTheOwner,
}
