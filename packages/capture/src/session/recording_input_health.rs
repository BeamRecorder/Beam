use crate::{CaptureError, input::InputAccessError};
#[cfg(any(target_os = "linux", test))]
use crate::{
    input::{InputAccessState, InputAccessStatus},
    model::{CursorSelection, HealthEvent},
};

use super::RecordingSession;

impl RecordingSession {
    pub fn input_capture_error(&mut self) -> Result<Option<InputAccessError>, CaptureError> {
        #[cfg(target_os = "linux")]
        if matches!(
            self.state,
            crate::session::SessionState::Recording | crate::session::SessionState::Paused
        ) && self.input_capture_error.is_none()
            && matches!(
                self.request.cursor,
                CursorSelection::Separate {
                    capture_clicks: true,
                    ..
                } | CursorSelection::Separate {
                    capture_shortcuts: true,
                    ..
                }
            )
        {
            return self.update_input_health(&crate::input::input_access_status());
        }
        Ok(self.input_capture_error.clone())
    }

    #[cfg(any(target_os = "linux", test))]
    pub(super) fn update_input_health(
        &mut self,
        status: &InputAccessStatus,
    ) -> Result<Option<InputAccessError>, CaptureError> {
        if !matches!(
            self.state,
            crate::session::SessionState::Recording | crate::session::SessionState::Paused
        ) {
            return Ok(None);
        }
        if self.input_capture_error.is_some() {
            return Ok(self.input_capture_error.clone());
        }
        let Some(error) = requested_input_error(&self.request.cursor, status) else {
            return Ok(None);
        };
        let message = format!(
            "Interaction capture stopped: {} Automatic zooms and shortcuts may be incomplete. Stop and restart recording to restore access.",
            error.message
        );
        self.input_capture_error = Some(InputAccessError {
            message: message.clone(),
            ..error
        });
        self.manifest.warnings.push(message.clone());
        crate::session::recording_support::append_jsonl(
            &self.layout.health(),
            &HealthEvent::Warning {
                session_ns: self.session_ns(),
                message,
            },
        )?;
        self.writer.checkpoint(&self.manifest)?;
        Ok(self.input_capture_error.clone())
    }
}

#[cfg(any(target_os = "linux", test))]
fn requested_input_error(
    cursor: &CursorSelection,
    status: &InputAccessStatus,
) -> Option<InputAccessError> {
    let CursorSelection::Separate {
        capture_clicks,
        capture_shortcuts,
        ..
    } = cursor
    else {
        return None;
    };
    if !capture_clicks && !capture_shortcuts {
        return None;
    }
    if status.state == InputAccessState::Available
        && (!capture_clicks || status.clicks)
        && (!capture_shortcuts || status.shortcuts)
    {
        return None;
    }
    Some(status.error.clone().unwrap_or_else(|| InputAccessError {
        code: "input-capture-unavailable".into(),
        message:
            "Linux input access or the required mouse/keyboard devices became unavailable.".into(),
    }))
}

#[cfg(test)]
#[path = "recording_input_health_tests.rs"]
mod tests;
