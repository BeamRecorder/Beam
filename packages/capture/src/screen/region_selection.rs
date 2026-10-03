use crate::{
    CaptureError,
    model::{CursorSelection, ScreenSelection},
    screenshot::{ScreenshotRequest, ScreenshotResult},
};
use serde::Serialize;

/// Owns the native screen authorization until it is consumed by capture or cancelled.
pub struct RegionSelection {
    screen: ScreenSelection,
    #[cfg(target_os = "linux")]
    pub(crate) linux: super::linux::LinuxRegionSelection,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegionSelectionPreview {
    #[serde(flatten)]
    pub dimensions: ScreenshotResult,
    #[cfg(target_os = "linux")]
    pub display: super::linux::PortalDisplayGeometry,
}
impl RegionSelection {
    pub fn prepare(
        config: ScreenshotRequest,
        cursor: CursorSelection,
    ) -> Result<(Self, RegionSelectionPreview), CaptureError> {
        let display = match &config.screen {
            ScreenSelection::Portal {
                kind: crate::model::PortalSourceKind::Monitor,
                restore_token: None,
            } => true,
            ScreenSelection::Source { source_id } => {
                source_id.as_str().starts_with("sck:display:")
                    || source_id.as_str().starts_with("wgc:monitor:")
            }
            _ => false,
        };
        if !display
            || config.region.is_some()
            || config
                .output
                .extension()
                .is_none_or(|extension| extension != "png")
        {
            return Err(CaptureError::InvalidConfiguration(
                "Region selection requires a display, no crop and a PNG preview path".into(),
            ));
        }
        let screen = config.screen.clone();
        #[cfg(target_os = "linux")]
        {
            if !matches!(
                config.screen,
                ScreenSelection::Portal {
                    kind: crate::model::PortalSourceKind::Monitor,
                    restore_token: None
                }
            ) || config.region.is_some()
            {
                return Err(CaptureError::InvalidConfiguration(
                    "Region selection requires an uncropped Portal monitor".into(),
                ));
            }
            let (linux, frame, display) = super::linux::LinuxRegionSelection::open(cursor)?;
            let dimensions = crate::screenshot::write_png(&frame, &config.output)?;
            Ok((
                Self { screen, linux },
                RegionSelectionPreview {
                    dimensions,
                    display,
                },
            ))
        }
        #[cfg(not(target_os = "linux"))]
        {
            let _ = cursor;
            let dimensions = crate::screenshot::capture(config)?;
            Ok((Self { screen }, RegionSelectionPreview { dimensions }))
        }
    }
}

impl RegionSelection {
    pub(crate) fn validate_source(
        &self,
        selected: Option<&ScreenSelection>,
    ) -> Result<(), CaptureError> {
        if selected != Some(&self.screen) {
            return Err(CaptureError::InvalidConfiguration(
                "The recording source differs from the selected region monitor".into(),
            ));
        }
        Ok(())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_window_selection_before_opening_a_portal() {
        let config = ScreenshotRequest {
            screen: ScreenSelection::Portal {
                kind: crate::model::PortalSourceKind::Window,
                restore_token: None,
            },
            region: None,
            output: "preview.png".into(),
            excluded_window_handles: vec![],
        };
        assert!(RegionSelection::prepare(config, CursorSelection::Disabled).is_err());
    }
    #[test]
    fn rejects_a_crop_before_native_preview() {
        let config = ScreenshotRequest {
            screen: ScreenSelection::Portal {
                kind: crate::model::PortalSourceKind::Monitor,
                restore_token: None,
            },
            region: Some(crate::model::ScreenRegion {
                x: 0.0,
                y: 0.0,
                width: 0.5,
                height: 0.5,
            }),
            output: "preview.png".into(),
            excluded_window_handles: vec![],
        };
        assert!(RegionSelection::prepare(config, CursorSelection::Disabled).is_err());
    }
    #[test]
    fn rejects_invalid_preview_outputs_before_native_preview() {
        let config = ScreenshotRequest {
            screen: ScreenSelection::Portal {
                kind: crate::model::PortalSourceKind::Monitor,
                restore_token: None,
            },
            region: None,
            output: "preview.jpg".into(),
            excluded_window_handles: vec![],
        };
        assert!(RegionSelection::prepare(config, CursorSelection::Disabled).is_err());
    }
}
