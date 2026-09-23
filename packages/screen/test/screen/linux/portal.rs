#![cfg(test)]
#![allow(clippy::expect_used, clippy::panic)]

use super::{
    PortalControl, PortalReady, PreparedPortal, cursor_mode, map_portal_error,
    prepare_portal_with_worker, source_type,
};
use crate::model::{CursorSelection, PortalSourceKind};
use ashpd::desktop::screencast::{CursorMode, SourceType};

#[test]
fn portal_picker_modes_follow_the_requested_screen_and_cursor() {
    assert!(source_type(PortalSourceKind::Monitor).contains(SourceType::Monitor));
    assert!(!source_type(PortalSourceKind::Monitor).contains(SourceType::Window));
    assert!(source_type(PortalSourceKind::Window).contains(SourceType::Window));
    assert!(!source_type(PortalSourceKind::Window).contains(SourceType::Monitor));
    let either = source_type(PortalSourceKind::MonitorOrWindow);
    assert!(either.contains(SourceType::Monitor));
    assert!(either.contains(SourceType::Window));
    assert_eq!(cursor_mode(CursorSelection::Disabled), CursorMode::Hidden);
    assert_eq!(cursor_mode(CursorSelection::Embedded), CursorMode::Embedded);
    assert_eq!(
        cursor_mode(CursorSelection::default()),
        CursorMode::Metadata
    );
}

#[test]
fn portal_errors_preserve_cancellation_denial_version_and_unavailable_codes() {
    use crate::NativeCaptureErrorCode as Code;
    let cases = [
        (
            ashpd::Error::Response(ashpd::desktop::ResponseError::Cancelled),
            Code::PortalCancelled,
        ),
        (
            ashpd::Error::Portal(ashpd::PortalError::Cancelled("cancelled".into())),
            Code::PortalCancelled,
        ),
        (
            ashpd::Error::Response(ashpd::desktop::ResponseError::Other),
            Code::PortalDenied,
        ),
        (
            ashpd::Error::Portal(ashpd::PortalError::NotAllowed("denied".into())),
            Code::PortalDenied,
        ),
        (
            ashpd::Error::RequiresVersion(2, 1),
            Code::PortalVersionUnsupported,
        ),
        (ashpd::Error::NoResponse, Code::PortalUnavailable),
    ];
    for (error, code) in cases {
        let mapped = map_portal_error(error);
        assert_eq!(mapped.code(), code.as_str());
    }
}

#[test]
fn prepared_portal_remote_fd_can_only_be_consumed_once() -> Result<(), Box<dyn std::error::Error>> {
    let file = std::fs::File::open("/dev/null")?;
    let mut portal = PreparedPortal {
        remote_fd: Some(file.into()),
        node_id: 7,
        stream_id: Some("stream-7".into()),
        source_type: Some(SourceType::Monitor),
        control: PortalControl {
            commands: None,
            thread: None,
        },
    };
    assert_eq!(portal.node_id, 7);
    assert!(portal.is_available());
    let _fd = portal.take_remote_fd()?;
    let error = portal.take_remote_fd().err();
    assert_eq!(
        error.as_ref().map(crate::CaptureError::code),
        Some(crate::NativeCaptureErrorCode::PipewireConnectFailed.as_str())
    );
    portal.close()?;
    portal.close()?;
    Ok(())
}

#[test]
fn portal_control_reports_worker_completion_and_propagates_its_error() {
    let thread =
        std::thread::spawn(|| Err(crate::CaptureError::Backend("portal fixture failed".into())));
    let mut control = PortalControl {
        commands: None,
        thread: Some(thread),
    };
    let error = control.close().err();
    assert!(
        error
            .as_ref()
            .is_some_and(|error| error.to_string().contains("portal fixture failed"))
    );
    assert!(control.is_available());
    assert!(control.close().is_ok());
}

#[test]
fn portal_control_converts_worker_panic_to_session_closed_error() {
    let thread = std::thread::spawn(|| -> Result<(), crate::CaptureError> {
        std::panic::resume_unwind(Box::new("fixture worker panic"));
    });
    let mut control = PortalControl {
        commands: None,
        thread: Some(thread),
    };
    let error = control.close().err();
    assert_eq!(
        error.as_ref().map(crate::CaptureError::code),
        Some(crate::NativeCaptureErrorCode::PortalSessionClosed.as_str())
    );
    assert!(control.close().is_ok());
}

#[test]
fn portal_worker_prepares_remote_and_closes_on_command() -> Result<(), Box<dyn std::error::Error>> {
    let mut portal = prepare_portal_with_worker(|mut commands, ready| {
        let file = std::fs::File::open("/dev/null")
            .map_err(|error| crate::CaptureError::Backend(error.to_string()))?;
        ready
            .send(Ok(PortalReady {
                remote_fd: file.into(),
                node_id: 42,
                stream_id: Some("fixture-stream".into()),
                source_type: Some(SourceType::Window),
            }))
            .map_err(|error| crate::CaptureError::Backend(error.to_string()))?;
        let command = commands.blocking_recv();
        assert!(matches!(command, Some(super::PortalCommand::Close)));
        Ok(())
    })?;
    assert_eq!(portal.node_id, 42);
    assert_eq!(portal.stream_id.as_deref(), Some("fixture-stream"));
    assert_eq!(portal.source_type, Some(SourceType::Window));
    assert!(portal.is_available());
    let _fd = portal.take_remote_fd()?;
    assert_eq!(
        portal
            .take_remote_fd()
            .err()
            .as_ref()
            .map(crate::CaptureError::code),
        Some(crate::NativeCaptureErrorCode::PipewireConnectFailed.as_str())
    );
    portal.close()?;
    assert!(portal.is_available());
    portal.close()?;
    Ok(())
}

#[test]
fn portal_worker_preparation_error_is_propagated() {
    let error = prepare_portal_with_worker(|_commands, ready| {
        ready
            .send(Err(crate::CaptureError::Backend(
                "fixture preparation rejected".into(),
            )))
            .expect("send preparation failure");
        Ok(())
    })
    .err();
    assert!(
        error
            .as_ref()
            .is_some_and(|error| error.to_string().contains("fixture preparation rejected"))
    );
}

#[test]
fn portal_worker_early_exit_and_panic_report_unavailable() {
    for panic in [false, true] {
        let error = prepare_portal_with_worker(move |_commands, _ready| {
            if panic {
                panic!("fixture panic before ready");
            }
            Ok(())
        })
        .err();
        assert_eq!(
            error.as_ref().map(crate::CaptureError::code),
            Some(crate::NativeCaptureErrorCode::PortalUnavailable.as_str())
        );
    }
}

#[test]
fn portal_worker_error_after_preparation_is_returned_on_close() {
    let mut portal = prepare_portal_with_worker(|_commands, ready| {
        let file = std::fs::File::open("/dev/null")
            .map_err(|error| crate::CaptureError::Backend(error.to_string()))?;
        ready
            .send(Ok(PortalReady {
                remote_fd: file.into(),
                node_id: 1,
                stream_id: None,
                source_type: None,
            }))
            .map_err(|error| crate::CaptureError::Backend(error.to_string()))?;
        Err(crate::CaptureError::Backend(
            "worker failed after ready".into(),
        ))
    })
    .expect("portal initially ready");
    let error = portal.close().err();
    assert!(
        error
            .as_ref()
            .is_some_and(|error| error.to_string().contains("worker failed after ready"))
    );
    assert!(portal.close().is_ok());
}

#[test]
fn completed_portal_worker_is_unavailable_before_close_and_close_is_repeatable() {
    let mut portal = prepare_portal_with_worker(|_commands, ready| {
        let file = std::fs::File::open("/dev/null")
            .map_err(|error| crate::CaptureError::Backend(error.to_string()))?;
        ready
            .send(Ok(PortalReady {
                remote_fd: file.into(),
                node_id: 9,
                stream_id: None,
                source_type: None,
            }))
            .map_err(|error| crate::CaptureError::Backend(error.to_string()))?;
        Ok(())
    })
    .expect("portal ready");
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(1);
    while portal.is_available() && std::time::Instant::now() < deadline {
        std::thread::sleep(std::time::Duration::from_millis(1));
    }
    assert!(!portal.is_available());
    portal.close().expect("close completed worker");
    portal.close().expect("repeat close");
}

#[test]
fn dropping_prepared_portal_sends_close_to_its_worker() {
    let closed = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
    let observed = closed.clone();
    let portal = prepare_portal_with_worker(move |mut commands, ready| {
        let file = std::fs::File::open("/dev/null")
            .map_err(|error| crate::CaptureError::Backend(error.to_string()))?;
        ready
            .send(Ok(PortalReady {
                remote_fd: file.into(),
                node_id: 10,
                stream_id: None,
                source_type: None,
            }))
            .map_err(|error| crate::CaptureError::Backend(error.to_string()))?;
        if matches!(commands.blocking_recv(), Some(super::PortalCommand::Close)) {
            observed.store(true, std::sync::atomic::Ordering::Release);
        }
        Ok(())
    })
    .expect("portal ready");
    drop(portal);
    assert!(closed.load(std::sync::atomic::Ordering::Acquire));
}

#[test]
fn worker_preparation_preserves_cancelled_error_code() {
    let error = prepare_portal_with_worker(|_commands, ready| {
        ready
            .send(Err(crate::CaptureError::native(
                crate::NativeCaptureErrorCode::PortalCancelled,
                "picker cancelled",
            )))
            .expect("send cancellation");
        Ok(())
    })
    .err();
    assert_eq!(
        error.as_ref().map(crate::CaptureError::code),
        Some(crate::NativeCaptureErrorCode::PortalCancelled.as_str())
    );
}
