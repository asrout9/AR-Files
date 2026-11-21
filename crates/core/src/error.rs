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

    #[error("Authentication error: {0}")]
    Authentication(String),

    #[error("Network error: {0}")]
    Network(String),

    #[error("Serialization error: {0}")]
    Serialization(String),

    #[error("Operation timed out")]
    Timeout,

    #[error("Operation was cancelled")]
    Cancelled,

    #[error("Unresponsive mount at '{path}' exceeded deadline")]
    UnresponsiveMount { path: String },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RecoveryAction {
    Retry,
    OpenLog,
    Reconnect,
    None,
}

impl CirrusError {
    pub fn recovery_action(&self) -> RecoveryAction {
        match self {
            Self::AuthRequired { .. } | Self::Authentication(_) => RecoveryAction::Reconnect,
            Self::CircuitBreakerOpen { .. }
            | Self::Provider { .. }
            | Self::Network(_)
            | Self::Timeout
            | Self::UnresponsiveMount { .. } => RecoveryAction::Retry,
            Self::Database(_)
            | Self::Storage(_)
            | Self::Sync(_)
            | Self::Io(_)
            | Self::Serialization(_) => RecoveryAction::OpenLog,
            _ => RecoveryAction::None,
        }
    }

    pub fn user_message(&self) -> String {
        match self {
            Self::NotFound { entity, id } => format!("{} '{}' could not be found.", entity, id),
            Self::AuthRequired { reason, .. } => {
                format!("Account disconnected: {}. Please sign in again.", reason)
            }
            Self::CircuitBreakerOpen { .. } => {
                "Remote service is temporarily unresponsive. Operating in offline mode.".to_string()
            }
            Self::UnresponsiveMount { path } => format!(
                "Mount '{}' is unresponsive. Background stat cancelled safely.",
                path
            ),
            Self::Conflict { reason, .. } => format!("Sync conflict: {}", reason),
            other => other.to_string(),
        }
    }
}

pub type ArError = CirrusError;
pub type Result<T, E = CirrusError> = std::result::Result<T, E>;
