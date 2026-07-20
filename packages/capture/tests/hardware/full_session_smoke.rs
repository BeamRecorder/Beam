use std::{path::PathBuf, thread, time::Duration};

use capture::{
    catalog::{NativeCatalog, SourceCatalog},
    model::{CaptureRequest, SessionManifest},
    session::{RecordingSession, SessionState},
};

/// Runs a real, user-selected multiptrack capture.
///
/// `CAPTURE_HARDWARE_CONFIG` must point to a JSON encoded `CaptureRequest` whose source IDs come
/// from `capture-probe discover`. `CAPTURE_HARDWARE_DURATION_SECONDS` defaults to ten seconds.
#[test]
#[ignore = "requires real capture hardware, permissions, and CAPTURE_HARDWARE_CONFIG"]
fn records_and_finalizes_a_real_session() -> Result<(), Box<dyn std::error::Error>> {
    let config_path = std::env::var_os("CAPTURE_HARDWARE_CONFIG")
        .map(PathBuf::from)
        .ok_or("CAPTURE_HARDWARE_CONFIG must point to a CaptureRequest JSON file")?;
    let request: CaptureRequest = serde_json::from_slice(&std::fs::read(config_path)?)?;
    let duration_seconds = std::env::var("CAPTURE_HARDWARE_DURATION_SECONDS")
        .ok()
        .map(|value| value.parse::<u64>())
        .transpose()?
        .unwrap_or(10);

    let snapshot = NativeCatalog::default().snapshot()?;
    let mut session = RecordingSession::prepare(request, snapshot)?;
    assert_eq!(session.state(), SessionState::Armed);
    session.start()?;
    assert_eq!(session.state(), SessionState::Recording);
    thread::sleep(Duration::from_secs(duration_seconds));
    let manifest_path = session.stop()?;
    assert_eq!(session.state(), SessionState::Completed);

    let manifest: SessionManifest = serde_json::from_slice(&std::fs::read(&manifest_path)?)?;
    assert!(manifest.completed);
    assert!(manifest.duration_ns >= duration_seconds.saturating_mul(1_000_000_000));
    assert!(!manifest.tracks.is_empty());
    for track in &manifest.tracks {
        assert!(
            !track.segments.is_empty(),
            "track {:?} did not produce a segment",
            track.kind
        );
        for segment in &track.segments {
            assert!(segment.end_ns.is_some(), "segment was not finalized");
        }
    }
    Ok(())
}
