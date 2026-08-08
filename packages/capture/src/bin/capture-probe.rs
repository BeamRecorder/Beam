use std::io::{self, Write};

use capture::{
    catalog::{NativeCatalog, SourceCatalog},
    protocol::write_json_line,
};

#[cfg(target_os = "linux")]
use std::sync::{Arc, Mutex};

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
    let command = std::env::args().nth(1).unwrap_or_else(|| "discover".into());
    let snapshot = NativeCatalog::default().snapshot()?;
    let value = match command.as_str() {
        "discover" => serde_json::to_value(snapshot)?,
        "capabilities" => serde_json::to_value(snapshot.capabilities)?,
        "permissions" => serde_json::to_value(snapshot.permissions)?,
        "formats" => {
            let source = argument_value("--source")?;
            serde_json::to_value(
                snapshot
                    .sources
                    .iter()
                    .find(|entry| entry.id.as_str() == source)
                    .ok_or_else(|| capture::CaptureError::SourceNotFound(source.clone()))?
                    .capabilities
                    .formats
                    .clone(),
            )?
        }
        #[cfg(target_os = "linux")]
        "linux-native-capabilities" => serde_json::to_value(
            capture::screen::probe_native_capabilities(std::time::Duration::from_secs(3))?,
        )?,
        #[cfg(target_os = "linux")]
        "linux-native-capture" => run_linux_native_capture()?,
        other => {
            return Err(capture::CaptureError::Protocol(format!(
                "unknown probe command: {other}"
            )));
        }
    };
    write_json_line(&mut io::stdout().lock(), &value)
}

#[cfg(target_os = "linux")]
#[derive(Debug, Default, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct LinuxProbeSummary {
    format: Option<capture::screen::VideoFormat>,
    samples: u64,
    cursor_samples: u64,
    discontinuities: u64,
    lost_frames: u64,
    first_session_ns: Option<u64>,
    last_session_ns: Option<u64>,
    last_native_pts_ns: Option<u64>,
    timestamp_source: Option<capture::screen::TimestampSource>,
    finished: bool,
}

#[cfg(target_os = "linux")]
struct ProbeSink(Arc<Mutex<LinuxProbeSummary>>);

#[cfg(target_os = "linux")]
impl capture::screen::ScreenSampleSink for ProbeSink {
    fn format_changed(
        &mut self,
        format: capture::screen::VideoFormat,
    ) -> Result<(), capture::CaptureError> {
        self.lock()?.format = Some(format);
        Ok(())
    }

    fn push(
        &mut self,
        sample: capture::screen::OwnedScreenSample,
    ) -> Result<(), capture::CaptureError> {
        let mut summary = self.lock()?;
        summary.samples = summary.samples.saturating_add(1);
        if matches!(
            sample.cursor,
            capture::screen::CursorSampleState::Known { .. }
        ) {
            summary.cursor_samples = summary.cursor_samples.saturating_add(1);
        }
        summary
            .first_session_ns
            .get_or_insert(sample.timestamp.session_ns);
        summary.last_session_ns = Some(sample.timestamp.session_ns);
        summary.last_native_pts_ns = sample.timestamp.native_pts_ns;
        summary.timestamp_source = Some(sample.timestamp.source);
        Ok(())
    }

    fn discontinuity(
        &mut self,
        event: capture::screen::ScreenDiscontinuity,
    ) -> Result<(), capture::CaptureError> {
        let mut summary = self.lock()?;
        summary.discontinuities = summary.discontinuities.saturating_add(1);
        summary.lost_frames = summary.lost_frames.saturating_add(event.lost_frames);
        Ok(())
    }

    fn finish(&mut self) -> Result<(), capture::CaptureError> {
        self.lock()?.finished = true;
        Ok(())
    }
}

#[cfg(target_os = "linux")]
impl ProbeSink {
    fn lock(&self) -> Result<std::sync::MutexGuard<'_, LinuxProbeSummary>, capture::CaptureError> {
        self.0.lock().map_err(|_| {
            capture::CaptureError::Backend("Linux probe summary lock was poisoned".into())
        })
    }
}

#[cfg(target_os = "linux")]
fn run_linux_native_capture() -> Result<serde_json::Value, capture::CaptureError> {
    use capture::{
        model::{CursorSelection, PortalSourceKind, RecordingSettings, ScreenSelection},
        screen::{ScreenConsumer, ScreenOpenRequest, ScreenRecording},
        session::StartGate,
    };

    let duration = argument_value("--duration-seconds")?
        .parse::<u64>()
        .map_err(|error| capture::CaptureError::Protocol(error.to_string()))?;
    if duration == 0 || duration > 300 {
        return Err(capture::CaptureError::InvalidConfiguration(
            "probe duration must be between 1 and 300 seconds".into(),
        ));
    }
    let kind = match optional_argument_value("--kind").as_deref() {
        None | Some("both") => PortalSourceKind::MonitorOrWindow,
        Some("monitor") => PortalSourceKind::Monitor,
        Some("window") => PortalSourceKind::Window,
        Some(other) => {
            return Err(capture::CaptureError::Protocol(format!(
                "unknown Portal source kind: {other}"
            )));
        }
    };
    let summary = Arc::new(Mutex::new(LinuxProbeSummary::default()));
    let gate = Arc::new(StartGate::new());
    let mut settings = RecordingSettings::default();
    settings.queue_capacity = optional_argument_value("--queue-capacity").map_or(
        Ok(settings.queue_capacity),
        |value| {
            value
                .parse::<usize>()
                .map_err(|error| capture::CaptureError::Protocol(error.to_string()))
        },
    )?;
    let selection = ScreenSelection::Portal {
        kind,
        restore_token: None,
    };
    let mut recording = ScreenRecording::open(ScreenOpenRequest {
        selection: &selection,
        recording: &settings,
        region: None,
        cursor: CursorSelection::Separate {
            capture_clicks: false,
            capture_shape: false,
        },
        start_ns: 0,
        start_gate: gate.clone(),
        consumer: ScreenConsumer::Samples(Box::new(ProbeSink(summary.clone()))),
    })?;
    gate.release(0)?;
    recording.start()?;
    let total = std::time::Duration::from_secs(duration);
    let first = total / 2;
    std::thread::sleep(first);
    recording.pause()?;
    let resume_ns = u64::try_from(first.as_nanos()).unwrap_or(u64::MAX);
    let resume_gate = Arc::new(StartGate::new());
    resume_gate.release(resume_ns)?;
    recording.resume(resume_ns, resume_gate)?;
    std::thread::sleep(total - first);
    recording.stop()?;
    let metrics = recording.metrics().snapshot();
    let summary = Arc::try_unwrap(summary)
        .map_err(|_| capture::CaptureError::Backend("Linux probe sink is still active".into()))?
        .into_inner()
        .map_err(|_| {
            capture::CaptureError::Backend("Linux probe summary lock was poisoned".into())
        })?;
    Ok(serde_json::json!({
        "backend": "xdg-portal-pipewire",
        "summary": summary,
        "metrics": {
            "framesReceived": metrics.frames_received,
            "framesDropped": metrics.frames_dropped,
            "cursorSamples": metrics.cursor_samples,
            "formatChanges": metrics.format_changes,
        },
        "createdManifest": false,
        "createdSegments": false,
    }))
}

fn argument_value(name: &str) -> Result<String, capture::CaptureError> {
    let mut arguments = std::env::args();
    while let Some(value) = arguments.next() {
        if value == name {
            return arguments.next().ok_or_else(|| {
                capture::CaptureError::Protocol(format!("missing value for {name}"))
            });
        }
    }
    Err(capture::CaptureError::Protocol(format!(
        "missing argument {name}"
    )))
}

fn optional_argument_value(name: &str) -> Option<String> {
    let mut arguments = std::env::args();
    while let Some(value) = arguments.next() {
        if value == name {
            return arguments.next();
        }
    }
    None
}
