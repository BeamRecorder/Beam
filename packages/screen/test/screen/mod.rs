use beam_media_core::{SessionClock, StartGate};
use beam_screen::model::{CursorSelection, ScreenSelection, SourceId};
use beam_screen::{ScreenQueueLimits, ScreenRequest, open_screen};
use std::sync::Arc;
#[cfg(target_os = "linux")]
#[test]
fn unsupported_direct_source_fails_before_portal_or_writer_open() {
    let request = ScreenRequest {
        selection: ScreenSelection::Source {
            source_id: SourceId::new("display:gone").unwrap(),
        },
        region: None,
        cursor: CursorSelection::Disabled,
        fps: 30,
        excluded_window_handles: vec![],
    };
    let result = open_screen(
        request,
        SessionClock::start(),
        Arc::new(StartGate::new()),
        ScreenQueueLimits::default(),
    );
    assert_eq!(result.err().unwrap().code(), "unsupported-operation");
}
