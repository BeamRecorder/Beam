mod frame;
mod recording;

use std::{path::PathBuf, sync::Arc};

use capture::{
    model::{CursorSelection, PortalSourceKind, RecordingSettings, ScreenSelection},
    screen::{ScreenConsumer, ScreenOpenRequest},
    session::StartGate,
};

#[test]
fn screen_request_keeps_the_shared_gate_and_source_selection_in_rust() {
    let selection = ScreenSelection::Portal {
        kind: PortalSourceKind::Monitor,
        restore_token: None,
    };
    let settings = RecordingSettings::default();
    let gate = Arc::new(StartGate::new());
    let request = ScreenOpenRequest {
        selection: &selection,
        recording: &settings,
        region: None,
        cursor: CursorSelection::Disabled,
        excluded_window_handles: &[],
        start_ns: 100,
        start_gate: gate.clone(),
        consumer: ScreenConsumer::EncodedFile {
            path: PathBuf::from("screen.webm"),
            cursor_directory: None,
        },
    };
    assert_eq!(request.start_ns, 100);
    assert!(Arc::ptr_eq(&request.start_gate, &gate));
}
