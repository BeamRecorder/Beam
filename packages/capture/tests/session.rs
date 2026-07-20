#![allow(clippy::expect_used)]

use std::sync::{Arc, Mutex};

use capture::{
    CaptureError,
    catalog::CatalogSnapshot,
    clock::MonotonicClock,
    model::{
        CaptureCapabilities, CaptureRequest, CursorSelection, FailurePolicy, PermissionSnapshot,
        ProjectId, RecordingSettings, TrackId,
    },
    session::{PreparedTrack, RecordingSession, SessionCoordinator, SessionState},
};

#[derive(Clone)]
struct FakeClock(Arc<Mutex<u64>>);
impl MonotonicClock for FakeClock {
    fn now_ns(&self) -> u64 {
        self.0.lock().map_or(0, |value| *value)
    }
}
struct FakeTrack {
    id: TrackId,
    calls: Arc<Mutex<Vec<&'static str>>>,
    fail_start: bool,
}
impl PreparedTrack for FakeTrack {
    fn track_id(&self) -> TrackId {
        self.id
    }
    fn start(&mut self, _: u64) -> Result<(), CaptureError> {
        self.calls
            .lock()
            .map_err(|_| CaptureError::Backend("lock".into()))?
            .push("start");
        if self.fail_start {
            Err(CaptureError::Backend("start failed".into()))
        } else {
            Ok(())
        }
    }
    fn pause(&mut self, _: u64) -> Result<(), CaptureError> {
        self.calls
            .lock()
            .map_err(|_| CaptureError::Backend("lock".into()))?
            .push("pause");
        Ok(())
    }
    fn resume(&mut self, _: u64) -> Result<(), CaptureError> {
        self.calls
            .lock()
            .map_err(|_| CaptureError::Backend("lock".into()))?
            .push("resume");
        Ok(())
    }
    fn stop(&mut self, _: u64) -> Result<(), CaptureError> {
        self.calls
            .lock()
            .map_err(|_| CaptureError::Backend("lock".into()))?
            .push("stop");
        Ok(())
    }
}

#[test]
fn full_state_machine_and_idempotent_stop() {
    let calls = Arc::new(Mutex::new(Vec::new()));
    let mut coordinator = SessionCoordinator::new(FakeClock(Arc::new(Mutex::new(7))));
    coordinator
        .prepare(vec![Box::new(FakeTrack {
            id: TrackId::new(),
            calls: calls.clone(),
            fail_start: false,
        })])
        .expect("prepare");
    assert_eq!(coordinator.start().expect("start"), 7);
    coordinator.pause().expect("pause");
    coordinator.resume().expect("resume");
    coordinator.stop().expect("stop");
    coordinator.stop().expect("second stop");
    assert_eq!(coordinator.state(), SessionState::Completed);
    assert_eq!(
        *calls.lock().expect("calls"),
        vec!["start", "pause", "resume", "stop"]
    );
}

#[test]
fn failed_track_rolls_back_started_tracks() {
    let first = Arc::new(Mutex::new(Vec::new()));
    let second = Arc::new(Mutex::new(Vec::new()));
    let mut coordinator = SessionCoordinator::new(FakeClock(Arc::new(Mutex::new(0))));
    coordinator
        .prepare(vec![
            Box::new(FakeTrack {
                id: TrackId::new(),
                calls: first.clone(),
                fail_start: false,
            }),
            Box::new(FakeTrack {
                id: TrackId::new(),
                calls: second,
                fail_start: true,
            }),
        ])
        .expect("prepare");
    assert!(coordinator.start().is_err());
    assert_eq!(*first.lock().expect("calls"), vec!["start", "stop"]);
}

#[test]
fn native_session_finalizes_storage_and_supports_pause_segments() {
    let temporary = tempfile::tempdir().expect("temporary directory");
    let request = CaptureRequest {
        project_id: ProjectId::new(),
        screen: None,
        system_audio: None,
        microphone: None,
        camera: None,
        cursor: CursorSelection::Disabled,
        recording: RecordingSettings {
            output_root: temporary.path().into(),
            minimum_free_bytes: 0,
            ..RecordingSettings::default()
        },
        failure_policy: FailurePolicy::FailFast,
    };
    let snapshot = CatalogSnapshot {
        generation: 1,
        created_at_utc: "2026-01-01T00:00:00Z".into(),
        capabilities: CaptureCapabilities::default(),
        permissions: PermissionSnapshot::default(),
        limitations: Vec::new(),
        sources: Vec::new(),
    };
    let mut session = RecordingSession::prepare(request, snapshot).expect("prepare native session");
    let partial = session
        .manifest_path()
        .with_file_name("manifest.partial.json");
    assert!(partial.exists());
    session.start().expect("start native session");
    session.pause().expect("pause native session");
    session.resume().expect("resume native session");
    let manifest_path = session.stop().expect("stop native session");
    assert_eq!(session.state(), SessionState::Completed);
    assert!(manifest_path.exists());
    assert!(!partial.exists());
    let manifest: capture::model::SessionManifest =
        serde_json::from_slice(&std::fs::read(manifest_path).expect("read final manifest"))
            .expect("parse final manifest");
    assert!(manifest.completed);
    assert!(manifest.tracks.is_empty());
}
