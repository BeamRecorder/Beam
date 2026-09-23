use beam_media_core::{SessionClock, StartGate};
use beam_screen::model::{CursorSelection, PortalSourceKind, ScreenRegion, ScreenSelection};
use beam_screen::{ScreenQueueLimits, ScreenRequest, open_screen};
use std::sync::Arc;
#[test]
fn invalid_request_fails_before_native_source_open() {
    let mut request = ScreenRequest {
        selection: ScreenSelection::Portal {
            kind: PortalSourceKind::Window,
            restore_token: None,
        },
        region: None,
        cursor: CursorSelection::Disabled,
        fps: 0,
        excluded_window_handles: vec![],
    };
    for fps in [0, 241] {
        request.fps = fps;
        assert!(
            open_screen(
                request.clone(),
                SessionClock::start(),
                Arc::new(StartGate::new()),
                ScreenQueueLimits::default()
            )
            .is_err()
        );
    }
    request.fps = 30;
    request.region = Some(ScreenRegion {
        x: 0.0,
        y: 0.0,
        width: 2.0,
        height: 1.0,
    });
    assert!(
        open_screen(
            request,
            SessionClock::start(),
            Arc::new(StartGate::new()),
            ScreenQueueLimits::default()
        )
        .is_err()
    );
}
