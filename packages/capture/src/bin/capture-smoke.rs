use std::{
    io::{self, Write},
    path::PathBuf,
    time::Duration,
};

use capture::model::SourceKind;
use capture::{
    catalog::{NativeCatalog, SourceCatalog},
    protocol::write_json_line,
};

fn main() {
    let code = match run() {
        Ok(()) => 0,
        Err(error) => {
            let _result = writeln!(io::stderr().lock(), "{error}");
            1
        }
    };
    std::process::exit(code);
}
fn run() -> Result<(), capture::CaptureError> {
    let mode = std::env::args().nth(1).ok_or_else(|| {
        capture::CaptureError::Protocol("usage: capture-smoke <screen|cursor|full>".into())
    })?;
    #[cfg(windows)]
    if mode == "screen" {
        return record_windows_screen();
    }
    #[cfg(windows)]
    if mode == "cursor" {
        return probe_windows_cursor();
    }
    if mode == "full" {
        return record_full_session();
    }
    let snapshot = NativeCatalog::default().snapshot()?;
    write_json_line(
        &mut io::stdout().lock(),
        &serde_json::json!({"mode": mode, "ready": true, "sources": snapshot.sources.len(), "note": "hardware stream opens only after explicit source validation"}),
    )
}

#[cfg(windows)]
fn record_windows_screen() -> Result<(), capture::CaptureError> {
    let snapshot = NativeCatalog::default().snapshot()?;
    let requested = argument("--source");
    let source = match requested {
        Some(id) => snapshot
            .sources
            .iter()
            .find(|source| source.id.as_str() == id)
            .ok_or(capture::CaptureError::SourceNotFound(id))?,
        None => snapshot
            .sources
            .iter()
            .find(|source| source.kind == SourceKind::Display && source.is_default)
            .or_else(|| {
                snapshot
                    .sources
                    .iter()
                    .find(|source| source.kind == SourceKind::Display)
            })
            .ok_or_else(|| capture::CaptureError::SourceNotFound("default display".into()))?,
    };
    let duration = argument("--duration")
        .map(|value| value.parse::<u64>())
        .transpose()
        .map_err(|error| capture::CaptureError::Protocol(error.to_string()))?
        .unwrap_or(10);
    let output = argument("--output")
        .map_or_else(|| PathBuf::from("capture-smoke-screen.mp4"), PathBuf::from);
    let mut recording = capture::screen::win::WindowsRecording::start(
        &source.id,
        &output,
        12_000_000,
        60,
        true,
        None,
        started_gate()?,
    )?;
    let metrics = recording.metrics();
    std::thread::sleep(Duration::from_secs(duration));
    recording.stop()?;
    write_json_line(
        &mut io::stdout().lock(),
        &serde_json::json!({
            "mode": "screen",
            "sourceId": source.id,
            "path": output,
            "durationSeconds": duration,
            "framesReceived": metrics.frames_received(),
            "framesDropped": metrics.frames_dropped(),
        }),
    )
}

#[cfg(windows)]
fn argument(name: &str) -> Option<String> {
    let mut arguments = std::env::args();
    while let Some(value) = arguments.next() {
        if value == name {
            return arguments.next();
        }
    }
    None
}

#[cfg(windows)]
fn started_gate() -> Result<std::sync::Arc<capture::session::StartGate>, capture::CaptureError> {
    let gate = std::sync::Arc::new(capture::session::StartGate::new());
    gate.release(0)?;
    Ok(gate)
}

#[cfg(windows)]
fn probe_windows_cursor() -> Result<(), capture::CaptureError> {
    use capture::cursor::{CaptureRegion, win::sample_cursor};

    let sample = sample_cursor(
        CaptureRegion {
            x: 0,
            y: 0,
            width: 16_384,
            height: 16_384,
        },
        true,
    )?;
    let shape = sample
        .shape
        .as_ref()
        .map(|shape| format!("win:{:x}", shape.native_id));
    write_json_line(
        &mut io::stdout().lock(),
        &serde_json::json!({
            "mode": "cursor",
            "position": {"x": sample.position.pixel_x, "y": sample.position.pixel_y},
            "visible": sample.visible,
            "leftPressed": sample.left_pressed,
            "rightPressed": sample.right_pressed,
            "middlePressed": sample.middle_pressed,
            "shapeId": shape,
        }),
    )
}

fn argument_value(name: &str) -> Option<String> {
    let mut arguments = std::env::args();
    while let Some(value) = arguments.next() {
        if value == name {
            return arguments.next();
        }
    }
    None
}

fn record_full_session() -> Result<(), capture::CaptureError> {
    use capture::{
        model::{
            CaptureRequest, CursorSelection, FailurePolicy, ProjectId, RecordingSettings,
            ScreenSelection,
        },
        session::RecordingSession,
    };

    let snapshot = NativeCatalog::default().snapshot()?;
    let screen = snapshot
        .sources
        .iter()
        .find(|source| source.kind == SourceKind::Display && source.is_default)
        .or_else(|| {
            snapshot
                .sources
                .iter()
                .find(|source| source.kind == SourceKind::Display)
        })
        .map(|source| ScreenSelection::Source {
            source_id: source.id.clone(),
        });
    let duration = argument_value("--duration")
        .map(|value| value.parse::<u64>())
        .transpose()
        .map_err(|error| capture::CaptureError::Protocol(error.to_string()))?
        .unwrap_or(10);
    let output_root = argument_value("--output")
        .map_or_else(|| PathBuf::from("capture-smoke-full"), PathBuf::from);
    let request = CaptureRequest {
        project_id: ProjectId::new(),
        screen,
        cursor: CursorSelection::Separate {
            capture_clicks: snapshot.capabilities.cursor_clicks,
            capture_shape: snapshot.capabilities.cursor_shapes,
        },
        recording: RecordingSettings {
            output_root,
            ..RecordingSettings::default()
        },
        failure_policy: FailurePolicy::ContinueWithoutOptionalTracks,
        region: None,
        excluded_process_id: None,
    };
    let mut session = RecordingSession::prepare(request, snapshot)?;
    session.start()?;
    std::thread::sleep(Duration::from_secs(duration));
    let manifest = session.stop()?;
    write_json_line(
        &mut io::stdout().lock(),
        &serde_json::json!({
            "mode": "full",
            "sessionId": session.session_id(),
            "durationSeconds": duration,
            "manifestPath": manifest,
            "state": session.state(),
        }),
    )
}
