use crate::{
    CaptureError,
    model::{
        CaptureRequest, CursorSelection, PermissionState, ScreenSelection, SourceId, SourceKind,
        SystemAudioSelection,
    },
};

use super::CatalogSnapshot;

pub trait SourceCatalog: Send + Sync {
    fn snapshot(&self) -> Result<CatalogSnapshot, CaptureError>;
}

pub fn validate_request(
    request: &CaptureRequest,
    snapshot: &CatalogSnapshot,
) -> Result<(), CaptureError> {
    request.validate_basic()?;
    if let Some(ScreenSelection::Source { source_id }) = &request.screen {
        let kind = require_kind(
            snapshot,
            source_id,
            &[
                SourceKind::Display,
                SourceKind::Window,
                SourceKind::Application,
            ],
        )?;
        let supported = match kind {
            SourceKind::Display => snapshot.capabilities.display_capture,
            SourceKind::Window => snapshot.capabilities.window_capture,
            SourceKind::Application => snapshot.capabilities.application_capture,
            _ => false,
        };
        require_capability(supported, "selected screen source")?;
    } else if matches!(request.screen, Some(ScreenSelection::Portal { .. })) {
        require_capability(snapshot.capabilities.portal_selection, "portal selection")?;
    }
    if let Some(SystemAudioSelection::OutputDevice(source_id)) = &request.system_audio {
        require_kind(snapshot, source_id, &[SourceKind::SystemAudio])?;
        require_capability(
            snapshot.capabilities.selectable_system_output,
            "selectable system output",
        )?;
    } else if request.system_audio.is_some() {
        require_capability(snapshot.capabilities.system_audio, "system audio")?;
    }
    if let Some(selection) = &request.microphone {
        require_kind(snapshot, &selection.source_id, &[SourceKind::Microphone])?;
        require_capability(snapshot.capabilities.microphone, "microphone")?;
    }
    match request.cursor {
        CursorSelection::Disabled => {}
        CursorSelection::Embedded => {
            require_capability(snapshot.capabilities.embedded_cursor, "embedded cursor")?;
        }
        CursorSelection::Separate {
            capture_clicks,
            capture_shape,
        } => {
            require_capability(snapshot.capabilities.separate_cursor, "separate cursor")?;
            require_capability(
                !capture_clicks || snapshot.capabilities.cursor_clicks,
                "cursor clicks",
            )?;
            require_capability(
                !capture_shape || snapshot.capabilities.cursor_shapes,
                "cursor shapes",
            )?;
        }
    }
    if request.screen.is_some() && snapshot.permissions.screen == Some(PermissionState::Denied) {
        return Err(CaptureError::PermissionDenied("screen recording".into()));
    }
    if request.microphone.is_some()
        && snapshot.permissions.microphone == Some(PermissionState::Denied)
    {
        return Err(CaptureError::PermissionDenied("microphone".into()));
    }
    Ok(())
}

fn require_kind(
    snapshot: &CatalogSnapshot,
    id: &SourceId,
    kinds: &[SourceKind],
) -> Result<SourceKind, CaptureError> {
    let source = snapshot
        .sources
        .iter()
        .find(|source| &source.id == id)
        .ok_or_else(|| CaptureError::SourceNotFound(id.to_string()))?;
    if !kinds.contains(&source.kind) {
        return Err(CaptureError::InvalidConfiguration(format!(
            "source {id} has incompatible kind {:?}",
            source.kind
        )));
    }
    Ok(source.kind)
}

fn require_capability(supported: bool, name: &str) -> Result<(), CaptureError> {
    if supported {
        Ok(())
    } else {
        Err(CaptureError::Unsupported(format!(
            "{name} is not supported by the current backend"
        )))
    }
}
