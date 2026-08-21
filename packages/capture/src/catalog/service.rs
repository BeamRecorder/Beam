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
        };
        require_capability(supported, "selected screen source")?;
    } else if let Some(ScreenSelection::Portal { kind, .. }) = &request.screen {
        // Linux capability discovery is advisory: Portal, PipeWire and encoder
        // probes can fail transiently even though the real Portal request works.
        // Let the capture backend perform the authoritative check at start time.
        if snapshot.diagnostics.platform != "linux" {
            require_capability(snapshot.capabilities.portal_selection, "portal selection")?;
            match kind {
                crate::model::PortalSourceKind::Monitor => {
                    require_capability(
                        snapshot.capabilities.display_capture,
                        "portal monitor capture",
                    )?;
                }
                crate::model::PortalSourceKind::Window => {
                    require_capability(
                        snapshot.capabilities.window_capture,
                        "portal window capture",
                    )?;
                }
                crate::model::PortalSourceKind::MonitorOrWindow => {
                    require_capability(
                        snapshot.capabilities.display_capture
                            && snapshot.capabilities.window_capture,
                        "combined portal monitor/window capture",
                    )?;
                }
            }
        }
    }
    match request.cursor {
        CursorSelection::Disabled => {}
        CursorSelection::Embedded => {
            require_capability(snapshot.capabilities.embedded_cursor, "embedded cursor")?;
        }
        CursorSelection::Separate {
            capture_clicks,
            capture_shortcuts,
            capture_shape,
        } => {
            require_capability(snapshot.capabilities.separate_cursor, "separate cursor")?;
            require_capability(
                !capture_clicks || snapshot.capabilities.cursor_clicks,
                "cursor clicks",
            )?;
            require_capability(
                !capture_shortcuts || snapshot.capabilities.input_shortcuts,
                "input shortcuts",
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
