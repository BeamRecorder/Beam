use std::{io, path::PathBuf, time::Duration};

use capture::{
    camera::win::WindowsCameraRecording,
    catalog::{NativeCatalog, SourceCatalog},
    model::{CameraSelection, SourceId, SourceKind},
    protocol::write_json_line,
};

pub(super) fn record_windows_camera() -> Result<(), capture::CaptureError> {
    let snapshot = NativeCatalog::default().snapshot()?;
    let source_id = match super::argument_value("--source") {
        Some(id) => SourceId::new(id)?,
        None => snapshot
            .sources
            .iter()
            .find(|source| source.kind == SourceKind::Camera)
            .map(|source| source.id.clone())
            .ok_or_else(|| capture::CaptureError::SourceNotFound("default camera".into()))?,
    };
    let duration = duration_argument(10)?;
    let output = super::argument_value("--output")
        .map_or_else(|| PathBuf::from("capture-smoke-camera.mp4"), PathBuf::from);
    let recording = WindowsCameraRecording::start(
        &CameraSelection {
            source_id: source_id.clone(),
            preferred_width: Some(1280),
            preferred_height: Some(720),
            preferred_fps: Some(30),
            preferred_pixel_format: None,
        },
        &output,
        6_000_000,
        8,
        super::started_gate()?,
    )?;
    let metrics = recording.metrics();
    let format = recording.format();
    std::thread::sleep(Duration::from_secs(duration));
    recording.stop()?;
    write_json_line(
        &mut io::stdout().lock(),
        &serde_json::json!({
            "mode": "camera",
            "sourceId": source_id,
            "path": output,
            "durationSeconds": duration,
            "width": format.resolution.width,
            "height": format.resolution.height,
            "fps": format.framerate,
            "pixelFormat": capture::camera::pixel_format_name(format.pixel_format),
            "framesReceived": metrics.frames_received(),
            "framesAcquired": metrics.frames_acquired(),
            "framesEncoded": metrics.frames_encoded(),
            "framesDropped": metrics.frames_dropped(),
            "interruptions": metrics.interruptions(),
        }),
    )
}

pub(super) fn probe_windows_camera_raw() -> Result<(), capture::CaptureError> {
    let snapshot = NativeCatalog::default().snapshot()?;
    let source = snapshot
        .sources
        .iter()
        .find(|source| source.kind == SourceKind::Camera)
        .ok_or_else(|| capture::CaptureError::SourceNotFound("default camera".into()))?;
    let device_id = source
        .id
        .as_str()
        .strip_prefix("camera:")
        .ok_or_else(|| capture::CaptureError::Protocol("invalid camera source ID".into()))?;
    let duration = duration_argument(5)?;
    let device = cameras::devices()
        .map_err(|error| capture::CaptureError::Backend(error.to_string()))?
        .into_iter()
        .find(|device| device.id.0 == device_id)
        .ok_or_else(|| capture::CaptureError::SourceNotFound(source.id.to_string()))?;
    let selection = CameraSelection {
        source_id: source.id.clone(),
        preferred_width: Some(1280),
        preferred_height: Some(720),
        preferred_fps: Some(30),
        preferred_pixel_format: None,
    };
    let requested = capture::camera::select_format(
        &cameras::probe(&device)
            .map_err(|error| capture::CaptureError::Backend(error.to_string()))?,
        &selection,
    )?;
    let camera = cameras::open(&device, requested)
        .map_err(|error| capture::CaptureError::Backend(error.to_string()))?;
    let format = camera.config;
    let started = std::time::Instant::now();
    let mut frames = 0_u64;
    let mut bytes = 0_u64;
    while started.elapsed() < Duration::from_secs(duration) {
        let frame = cameras::next_frame(&camera, cameras::DEFAULT_FRAME_TIMEOUT)
            .map_err(|error| capture::CaptureError::Backend(error.to_string()))?;
        frames = frames.saturating_add(1);
        bytes = bytes.saturating_add(
            u64::try_from(
                frame
                    .plane_primary
                    .len()
                    .saturating_add(frame.plane_secondary.len()),
            )
            .unwrap_or(u64::MAX),
        );
    }
    write_json_line(
        &mut io::stdout().lock(),
        &serde_json::json!({
            "mode": "camera-raw",
            "sourceId": source.id,
            "durationSeconds": duration,
            "width": format.resolution.width,
            "height": format.resolution.height,
            "fps": format.framerate,
            "pixelFormat": capture::camera::pixel_format_name(format.pixel_format),
            "framesAcquired": frames,
            "bytesAcquired": bytes,
        }),
    )
}

fn duration_argument(fallback: u64) -> Result<u64, capture::CaptureError> {
    super::argument_value("--duration")
        .map(|value| value.parse::<u64>())
        .transpose()
        .map_err(|error| capture::CaptureError::Protocol(error.to_string()))
        .map(|duration| duration.unwrap_or(fallback))
}
