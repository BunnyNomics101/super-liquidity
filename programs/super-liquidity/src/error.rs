use anchor_lang::prelude::*;

#[error]
pub enum userError {
    #[msg("Access denied")]
    AccessDenied,
}
