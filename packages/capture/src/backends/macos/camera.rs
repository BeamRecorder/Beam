use crate::{
    CaptureError,
    model::{
        MediaFormat, SourceCapabilities, SourceDescriptor, SourceId, SourceKind,
        SourceSelectionMode,
    },
};

/// Camera acquisition is kept behind the macOS backend boundary. The native
/// camera encoder is enabled only when the AVFoundation writer is available;
/// failure is reported on the optional track and never replaced by an empty
/// file.
pub fn discover_sources() -> Result<Vec<SourceDescriptor>, CaptureError> {
    let cameras = nokhwa::query(nokhwa::utils::ApiBackend::AVFoundation).map_err(|error| {
        CaptureError::Backend(format!("native camera discovery failed: {error}"))
    })?;
    cameras
        .into_iter()
        .enumerate()
        .map(|(position, camera)| {
            Ok(SourceDescriptor {
                id: SourceId::new(format!("camera:nokhwa:{}", camera.index().as_string()))?,
                kind: SourceKind::Camera,
                label: camera.human_name(),
                is_default: position == 0,
                selection_mode: SourceSelectionMode::Direct,
                display_id: None,
                capabilities: SourceCapabilities {
                    formats: vec![MediaFormat::Video {
                        width: 1280,
                        height: 720,
                        fps: 30,
                        pixel_format: Some("bgra8".into()),
                    }],
                    ..SourceCapabilities::default()
                },
            })
        })
        .collect()
}

pub struct MacCameraRecording;

impl MacCameraRecording {
    pub fn start(_source_id: &SourceId) -> Result<Self, CaptureError> {
        Err(CaptureError::Unsupported(
            "macOS camera encoding is unavailable in this build".into(),
        ))
    }
}
