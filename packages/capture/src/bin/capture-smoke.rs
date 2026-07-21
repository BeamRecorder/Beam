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
        capture::CaptureError::Protocol("usage: capture-smoke <screen|mic|full>".into())
    })?;
    #[cfg(windows)]
    if mode == "screen" {
        return record_windows_screen();
    }
    #[cfg(windows)]
    if mode == "cursor" {
        return probe_windows_cursor();
    }
    #[cfg(feature = "microphone")]
    if mode == "mic" {
        return record_microphone();
    }
    #[cfg(all(windows, feature = "system-audio"))]
    if mode == "system-audio" {
        return record_windows_system_audio();
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
    let recording = capture::screen::win::WindowsRecording::start(
        &source.id,
        &output,
        12_000_000,
        60,
        true,
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

#[cfg(any(windows, feature = "microphone"))]
fn started_gate() -> Result<std::sync::Arc<capture::session::StartGate>, capture::CaptureError> {
    let gate = std::sync::Arc::new(capture::session::StartGate::new());
    gate.release(0)?;
    Ok(gate)
}

#[cfg(windows)]
fn probe_windows_cursor() -> Result<(), capture::CaptureError> {
    use capture::cursor::{CaptureRegion, CursorBitmap, ShapeStore, win::sample_cursor};

    let sample = sample_cursor(
        CaptureRegion {
            x: 0,
            y: 0,
            width: 16_384,
            height: 16_384,
        },
        true,
    )?;
    let shape = if let Some(shape) = sample.shape.as_ref() {
        let mut store = ShapeStore::new("capture-smoke-cursor-shapes")?;
        Some(store.store(CursorBitmap {
            width: shape.width,
            height: shape.height,
            rgba: &shape.rgba,
            hotspot: shape.hotspot,
        })?)
    } else {
        None
    };
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

#[cfg(feature = "microphone")]
fn record_microphone() -> Result<(), capture::CaptureError> {
    use capture::{
        audio::microphone::MicrophoneRecording,
        model::{MicrophoneSelection, SourceId},
    };

    let snapshot = NativeCatalog::default().snapshot()?;
    let requested = argument_value("--source");
    let source_id = match requested {
        Some(id) => SourceId::new(id)?,
        None => snapshot
            .sources
            .iter()
            .find(|source| source.kind == SourceKind::Microphone && source.is_default)
            .or_else(|| {
                snapshot
                    .sources
                    .iter()
                    .find(|source| source.kind == SourceKind::Microphone)
            })
            .map(|source| source.id.clone())
            .ok_or_else(|| capture::CaptureError::SourceNotFound("default microphone".into()))?,
    };
    let duration = argument_value("--duration")
        .map(|value| value.parse::<u64>())
        .transpose()
        .map_err(|error| capture::CaptureError::Protocol(error.to_string()))?
        .unwrap_or(10);
    let output = argument_value("--output").map_or_else(
        || PathBuf::from("capture-smoke-microphone.wav"),
        PathBuf::from,
    );
    let recording = MicrophoneRecording::start(
        &MicrophoneSelection {
            source_id: source_id.clone(),
            preferred_sample_rate: None,
            preferred_channels: None,
        },
        &output,
        32,
        started_gate()?,
    )?;
    let metrics = recording.metrics();
    let sample_rate = recording.sample_rate();
    let channels = recording.channels();
    std::thread::sleep(Duration::from_secs(duration));
    let samples = recording.stop()?;
    write_json_line(
        &mut io::stdout().lock(),
        &serde_json::json!({
            "mode": "mic",
            "sourceId": source_id,
            "path": output,
            "durationSeconds": duration,
            "sampleRate": sample_rate,
            "channels": channels,
            "samplesWritten": samples,
            "samplesReceived": metrics.samples_received(),
            "samplesDropped": metrics.samples_dropped(),
            "interruptions": metrics.interruptions(),
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
            CaptureRequest, CursorSelection, FailurePolicy, MicrophoneSelection, ProjectId,
            RecordingSettings, ScreenSelection, SystemAudioSelection,
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
    let microphone = snapshot
        .sources
        .iter()
        .find(|source| source.kind == SourceKind::Microphone && source.is_default)
        .or_else(|| {
            snapshot
                .sources
                .iter()
                .find(|source| source.kind == SourceKind::Microphone)
        })
        .map(|source| MicrophoneSelection {
            source_id: source.id.clone(),
            preferred_sample_rate: None,
            preferred_channels: None,
        });
    let system_audio = snapshot
        .capabilities
        .system_audio
        .then_some(if cfg!(target_os = "macos") {
            SystemAudioSelection::ScreenCaptureMix
        } else {
            SystemAudioSelection::DefaultMix
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
        system_audio,
        microphone,
        cursor: CursorSelection::Separate {
            capture_clicks: snapshot.capabilities.cursor_clicks,
            capture_shape: snapshot.capabilities.cursor_shapes,
        },
        recording: RecordingSettings {
            output_root,
            ..RecordingSettings::default()
        },
        failure_policy: FailurePolicy::ContinueWithoutOptionalTracks,
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

#[cfg(all(windows, feature = "system-audio"))]
fn record_windows_system_audio() -> Result<(), capture::CaptureError> {
    use capture::{audio::system::win::WasapiLoopbackRecording, model::SourceId};

    let source = argument_value("--source").map(SourceId::new).transpose()?;
    let duration = argument_value("--duration")
        .map(|value| value.parse::<u64>())
        .transpose()
        .map_err(|error| capture::CaptureError::Protocol(error.to_string()))?
        .unwrap_or(10);
    let output = argument_value("--output").map_or_else(
        || PathBuf::from("capture-smoke-system-audio.wav"),
        PathBuf::from,
    );
    let recording = WasapiLoopbackRecording::start(source.as_ref(), &output, started_gate()?)?;
    let metrics = recording.metrics();
    let sample_rate = recording.sample_rate();
    let channels = recording.channels();
    std::thread::sleep(Duration::from_secs(duration));
    let samples = recording.stop()?;
    write_json_line(
        &mut io::stdout().lock(),
        &serde_json::json!({
            "mode": "system-audio",
            "sourceId": source,
            "path": output,
            "durationSeconds": duration,
            "sampleRate": sample_rate,
            "channels": channels,
            "samplesWritten": samples,
            "samplesReceived": metrics.samples_received(),
            "interruptions": metrics.interruptions(),
        }),
    )
}
