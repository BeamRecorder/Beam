use serde::{Deserialize, Serialize};

use crate::CaptureError;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum SessionState {
    Idle,
    Discovering,
    Preparing,
    Armed,
    Recording,
    Paused,
    Stopping,
    Finalizing,
    Completed,
    Degraded,
    Failed,
    Recoverable,
}

impl SessionState {
    pub(super) const fn can_cancel(self) -> bool {
        matches!(self, Self::Armed | Self::Failed)
    }

    pub fn transition(self, next: Self) -> Result<Self, CaptureError> {
        let valid = matches!(
            (self, next),
            (Self::Idle, Self::Discovering | Self::Preparing)
                | (
                    Self::Discovering,
                    Self::Idle | Self::Preparing | Self::Failed
                )
                | (Self::Preparing, Self::Armed | Self::Failed)
                | (Self::Armed, Self::Recording | Self::Stopping | Self::Failed)
                | (
                    Self::Recording,
                    Self::Paused | Self::Stopping | Self::Degraded | Self::Failed
                )
                | (
                    Self::Degraded,
                    Self::Paused | Self::Recording | Self::Stopping | Self::Failed
                )
                | (
                    Self::Paused,
                    Self::Recording | Self::Stopping | Self::Failed
                )
                | (Self::Stopping, Self::Finalizing | Self::Recoverable)
                | (Self::Finalizing, Self::Completed | Self::Recoverable)
        );
        if valid {
            Ok(next)
        } else {
            Err(CaptureError::InvalidTransition {
                from: format!("{self:?}"),
                to: format!("{next:?}"),
            })
        }
    }
}

#[cfg(test)]
#[path = "state_tests.rs"]
mod tests;
