#![cfg(test)]

use super::*;

#[test]
fn portal_source_capabilities_accept_either_requested_type_and_reject_missing_types() {
    let monitor = SourceType::Monitor.into();
    let window = SourceType::Window.into();
    assert!(validate_source_capabilities(monitor, PortalSourceKind::Monitor).is_ok());
    assert!(validate_source_capabilities(window, PortalSourceKind::Window).is_ok());
    assert!(validate_source_capabilities(monitor, PortalSourceKind::MonitorOrWindow).is_ok());
    assert!(validate_source_capabilities(window, PortalSourceKind::MonitorOrWindow).is_ok());

    let error = validate_source_capabilities(monitor, PortalSourceKind::Window).err();
    assert_eq!(
        error.as_ref().map(CaptureError::code),
        Some(NativeCaptureErrorCode::PortalVersionUnsupported.as_str())
    );
    let error = validate_source_capabilities(
        ashpd::enumflags2::BitFlags::empty(),
        PortalSourceKind::MonitorOrWindow,
    )
    .err();
    assert_eq!(
        error.as_ref().map(CaptureError::code),
        Some(NativeCaptureErrorCode::PortalVersionUnsupported.as_str())
    );
}

#[test]
fn portal_cursor_capabilities_require_exact_requested_mode() {
    let modes = CursorMode::Hidden | CursorMode::Embedded;
    assert!(validate_cursor_capabilities(modes, CursorSelection::Disabled).is_ok());
    assert!(validate_cursor_capabilities(modes, CursorSelection::Embedded).is_ok());
    let error = validate_cursor_capabilities(modes, CursorSelection::default()).err();
    assert_eq!(
        error.as_ref().map(CaptureError::code),
        Some(NativeCaptureErrorCode::PortalCursorMetadataUnavailable.as_str())
    );
    assert!(
        error
            .as_ref()
            .is_some_and(|error| error.to_string().contains("Metadata"))
    );
    assert!(
        validate_cursor_capabilities(CursorMode::Metadata.into(), CursorSelection::default(),)
            .is_ok()
    );
}
