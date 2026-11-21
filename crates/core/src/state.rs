use serde::{Deserialize, Serialize};
use std::fmt;
use std::str::FromStr;

use crate::error::{CirrusError, Result};

/// Represents the hydration and synchronization state of an item in the virtual filesystem.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FileState {
    /// Placeholder: zero bytes on local disk, metadata stored in SQLite.
    CloudOnly,
    /// Actively downloading content to local cache.
    Hydrating,
    /// Cached locally and verified; eligible for LRU cache eviction when disk is full.
    Available,
    /// Explicitly pinned by user ("Always keep on this device"); immune to cache eviction.
    Pinned,
    /// Local edits queued or actively streaming upload to cloud provider.
    SyncingUp,
    /// Concurrent conflict detected between local version and remote provider version.
    Conflict,
    /// An operation on this entry failed with a retryable or terminal error.
    Error,
    /// Explicitly excluded by user configuration or ignore rules.
    Excluded,
}

impl FileState {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::CloudOnly => "cloud_only",
            Self::Hydrating => "hydrating",
            Self::Available => "available",
            Self::Pinned => "pinned",
            Self::SyncingUp => "syncing_up",
            Self::Conflict => "conflict",
            Self::Error => "error",
            Self::Excluded => "excluded",
        }
    }

    /// Whether full file content exists locally and can be read immediately by applications.
    pub fn is_locally_present(&self) -> bool {
        matches!(self, Self::Available | Self::Pinned | Self::SyncingUp)
    }

    /// Whether this entry can be safely evicted to free local disk space.
    pub fn is_evictable(&self) -> bool {
        matches!(self, Self::Available)
    }

    /// Whether an on-demand hydration download can be initiated for this entry.
    pub fn can_start_hydration(&self) -> bool {
        matches!(self, Self::CloudOnly | Self::Error | Self::Conflict)
    }

    /// Validates and executes state transitions according to the lifecycle rules.
    pub fn transition_to(&self, next: FileState) -> Result<FileState> {
        if *self == next {
            return Ok(next);
        }

        let valid = match (self, next) {
            // CloudOnly can start hydrating, be marked excluded, or transition to error
            (Self::CloudOnly, Self::Hydrating | Self::Excluded | Self::Error) => true,

            // Hydrating can finish successfully (Available/Pinned), fail (Error/CloudOnly), or be cancelled
            (Self::Hydrating, Self::Available | Self::Pinned | Self::CloudOnly | Self::Error) => {
                true
            }

            // Available can be pinned, modified locally (SyncingUp), evicted (CloudOnly), or encounter error
            (Self::Available, Self::Pinned | Self::SyncingUp | Self::CloudOnly | Self::Error) => {
                true
            }

            // Pinned can be unpinned (Available), modified locally (SyncingUp), or encounter error.
            // Pinned CANNOT be evicted directly to CloudOnly without first unpinning or explicit user action.
            (Self::Pinned, Self::Available | Self::SyncingUp | Self::CloudOnly | Self::Error) => {
                true
            }

            // SyncingUp finishes by becoming Available or Pinned, or produces a Conflict/Error
            (
                Self::SyncingUp,
                Self::Available | Self::Pinned | Self::Conflict | Self::Error | Self::CloudOnly,
            ) => true,

            // Conflict can be resolved to Available, Pinned, or CloudOnly
            (
                Self::Conflict,
                Self::Available | Self::Pinned | Self::CloudOnly | Self::Hydrating,
            ) => true,

            // Error can be retried (Hydrating, SyncingUp), reset to CloudOnly, or marked Available if recovered
            (
                Self::Error,
                Self::CloudOnly
                | Self::Hydrating
                | Self::SyncingUp
                | Self::Available
                | Self::Pinned,
            ) => true,

            // Excluded can be un-excluded
            (Self::Excluded, Self::CloudOnly | Self::Available | Self::Pinned) => true,

            // Disallowed transitions
            _ => false,
        };

        if valid {
            Ok(next)
        } else {
            Err(CirrusError::InvalidStateTransition {
                current: self.as_str().to_string(),
                target: next.as_str().to_string(),
                reason: format!("Forbidden transition from {:?} to {:?}", self, next),
            })
        }
    }
}

impl fmt::Display for FileState {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

impl FromStr for FileState {
    type Err = CirrusError;

    fn from_str(s: &str) -> Result<Self> {
        match s {
            "cloud_only" => Ok(Self::CloudOnly),
            "hydrating" => Ok(Self::Hydrating),
            "available" => Ok(Self::Available),
            "pinned" => Ok(Self::Pinned),
            "syncing_up" => Ok(Self::SyncingUp),
            "conflict" => Ok(Self::Conflict),
            "error" => Ok(Self::Error),
            "excluded" => Ok(Self::Excluded),
            other => Err(CirrusError::Validation(format!(
                "Invalid file state identifier: '{}'",
                other
            ))),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_state_transitions() {
        assert_eq!(
            FileState::CloudOnly
                .transition_to(FileState::Hydrating)
                .unwrap(),
            FileState::Hydrating
        );
        assert_eq!(
            FileState::Hydrating
                .transition_to(FileState::Available)
                .unwrap(),
            FileState::Available
        );
        assert_eq!(
            FileState::Available
                .transition_to(FileState::Pinned)
                .unwrap(),
            FileState::Pinned
        );
        assert_eq!(
            FileState::Available
                .transition_to(FileState::CloudOnly)
                .unwrap(),
            FileState::CloudOnly
        );
    }

    #[test]
    fn test_eviction_predicates() {
        assert!(FileState::Available.is_evictable());
        assert!(!FileState::Pinned.is_evictable());
        assert!(!FileState::CloudOnly.is_evictable());
        assert!(!FileState::SyncingUp.is_evictable());
    }

    #[test]
    fn test_string_roundtrip() {
        let states = [
            FileState::CloudOnly,
            FileState::Hydrating,
            FileState::Available,
            FileState::Pinned,
            FileState::SyncingUp,
            FileState::Conflict,
            FileState::Error,
            FileState::Excluded,
        ];

        for state in states {
            let s = state.as_str();
            let parsed: FileState = s.parse().unwrap();
            assert_eq!(parsed, state);
        }
    }
}
