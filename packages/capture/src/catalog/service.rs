use crate::{
    CaptureError,
    model::{
        CaptureRequest, CursorSelection, PermissionState, ScreenSelection, SourceId, SourceKind,
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
        if request.region.is_some() && kind != SourceKind::Display {
            return Err(CaptureError::InvalidConfiguration(
                "screen region requires a display source".into(),
            ));
        }
        let supported = match kind {
            SourceKind::Display => snapshot.capabilities.display_capture,
            SourceKind::Window => snapshot.capabilities.window_capture,
            SourceKind::Application => snapshot.capabilities.application_capture,
            SourceKind::Camera | SourceKind::Microphone | SourceKind::SystemAudio => false,
        };
        require_capability(supported, "selected screen source")?;
    } else if matches!(request.screen, Some(ScreenSelection::Portal { .. })) {
        require_capability(snapshot.capabilities.portal_selection, "portal selection")?;
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
    validate_optional_source(
        request.camera.as_ref(),
        SourceKind::Camera,
        snapshot,
        snapshot.capabilities.camera_capture,
        "camera",
        snapshot.permissions.camera,
    )?;
    validate_optional_source(
        request.microphone.as_ref(),
        SourceKind::Microphone,
        snapshot,
        snapshot.capabilities.microphone_capture,
        "microphone",
        snapshot.permissions.microphone,
    )?;
    validate_optional_source(
        request.system_audio.as_ref(),
        SourceKind::SystemAudio,
        snapshot,
        snapshot.capabilities.system_audio_capture,
        "system audio",
        snapshot.permissions.system_audio,
    )?;
    Ok(())
}

fn validate_optional_source(
    id: Option<&SourceId>,
    expected_kind: SourceKind,
    snapshot: &CatalogSnapshot,
    capability: bool,
    label: &str,
    permission: Option<PermissionState>,
) -> Result<(), CaptureError> {
    let Some(id) = id else {
        return Ok(());
    };
    require_kind(snapshot, id, &[expected_kind])?;
    require_capability(capability, &format!("{label} capture"))?;
    if permission == Some(PermissionState::Denied) {
        return Err(CaptureError::PermissionDenied(label.into()));
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
