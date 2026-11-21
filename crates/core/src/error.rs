use thiserror::Error;

#[derive(Error, Debug, Clone, PartialEq, Eq)]
pub enum CirrusError {
    #[error("Entity '{entity}' with id '{id}' was not found")]
    NotFound { entity: String, id: String },

    #[error("Invalid state transition from '{current}' to '{target}': {reason}")]
    InvalidStateTransition {
        current: String,
        target: String,
        reason: String,
    },

    #[error("Database error: {0}")]
    Database(String),

    #[error("Storage error: {0}")]
    Storage(String),

    #[error("Provider '{provider}' error: {message}")]
    Provider {
        provider: String,
        message: String,
        retry_after_secs: Option<u64>,
    },

    #[error("Sync engine error: {0}")]
    Sync(String),

    #[error("Hydration error: {0}")]
    Hydration(String),

    #[error("I/O error: {0}")]
    Io(String),

    #[error("Validation failed: {0}")]
    Validation(String),

    #[error("Conflict detected for entry '{id}': {reason}")]
    Conflict { id: String, reason: String },

    #[error("Circuit breaker is open for account '{account_id}'. Remote calls suspended.")]
    CircuitBreakerOpen { account_id: String },

    #[error("Authentication required or expired for account '{account_id}': {reason}")]
    AuthRequired { account_id: String, reason: String },

    #[error("Operation was cancelled")]
    Cancelled,

    #[error("Unresponsive mount at '{path}' exceeded deadline")]
    UnresponsiveMount { path: String },
}

pub type Result<T, E = CirrusError> = std::result::Result<T, E>;
