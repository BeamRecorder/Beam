#![cfg(target_os = "linux")]
#![allow(clippy::expect_used)]

use capture::{
    CaptureError, NativeCaptureErrorCode,
    screen::linux::{LinuxNativeCapabilities, PortalProperties, evaluate_capabilities},
};

fn portal_properties(
    version: u32,
    monitor: bool,
    window: bool,
    hidden_cursor: bool,
    embedded_cursor: bool,
    metadata_cursor: bool,
) -> PortalProperties {
    PortalProperties {
        version,
        monitor,
        window,
        hidden_cursor,
        embedded_cursor,
        metadata_cursor,
    }
}

fn assert_product_gate_is_closed(capabilities: &LinuxNativeCapabilities) {
    assert!(!capabilities.recording_available);
}

#[test]
fn portal_version_one_disables_portal_capture_even_with_all_features() {
    let capabilities =
        evaluate_capabilities(portal_properties(1, true, true, true, true, true), true);

    assert_eq!(capabilities.backend, "xdg-portal-pipewire");
    assert_eq!(capabilities.portal_version, 1);
    assert!(!capabilities.portal_selection);
    assert!(!capabilities.display_capture);
    assert!(!capabilities.window_capture);
    assert!(!capabilities.separate_cursor);
    assert!(capabilities.hidden_cursor);
    assert!(capabilities.embedded_cursor);
    assert!(!capabilities.cursor_clicks);
    assert!(!capabilities.cursor_shapes);
    assert!(capabilities.pipewire_available);
    assert_product_gate_is_closed(&capabilities);
}

#[test]
fn portal_version_two_is_the_minimum_supported_version() {
    let capabilities =
        evaluate_capabilities(portal_properties(2, true, true, true, true, true), true);

    assert_eq!(capabilities.portal_version, 2);
    assert!(capabilities.portal_selection);
    assert!(capabilities.display_capture);
    assert!(capabilities.window_capture);
    assert!(capabilities.separate_cursor);
    assert_product_gate_is_closed(&capabilities);
}

#[test]
fn portal_versions_above_two_keep_the_same_contract() {
    for version in [3, 5, 42] {
        let capabilities = evaluate_capabilities(
            portal_properties(version, true, true, false, true, true),
            true,
        );

        assert_eq!(capabilities.portal_version, version);
        assert!(capabilities.portal_selection);
        assert!(capabilities.display_capture);
        assert!(capabilities.window_capture);
        assert!(!capabilities.hidden_cursor);
        assert!(capabilities.embedded_cursor);
        assert!(capabilities.separate_cursor);
        assert_product_gate_is_closed(&capabilities);
    }
}

#[test]
fn monitor_only_source_supports_display_but_not_window_capture() {
    let capabilities =
        evaluate_capabilities(portal_properties(5, true, false, true, false, true), true);

    assert!(capabilities.portal_selection);
    assert!(capabilities.display_capture);
    assert!(!capabilities.window_capture);
    assert!(capabilities.hidden_cursor);
    assert!(!capabilities.embedded_cursor);
    assert!(capabilities.separate_cursor);
}

#[test]
fn window_only_source_supports_window_but_not_display_capture() {
    let capabilities =
        evaluate_capabilities(portal_properties(5, false, true, false, true, true), true);

    assert!(capabilities.portal_selection);
    assert!(!capabilities.display_capture);
    assert!(capabilities.window_capture);
    assert!(!capabilities.hidden_cursor);
    assert!(capabilities.embedded_cursor);
    assert!(capabilities.separate_cursor);
}

#[test]
fn missing_source_types_disable_portal_selection() {
    let capabilities =
        evaluate_capabilities(portal_properties(5, false, false, true, true, true), true);

    assert!(!capabilities.portal_selection);
    assert!(!capabilities.display_capture);
    assert!(!capabilities.window_capture);
    assert!(!capabilities.separate_cursor);
    assert!(capabilities.hidden_cursor);
    assert!(capabilities.embedded_cursor);
}

#[test]
fn unavailable_pipewire_disables_all_capture_paths() {
    let capabilities =
        evaluate_capabilities(portal_properties(5, true, true, true, true, true), false);

    assert!(!capabilities.pipewire_available);
    assert!(!capabilities.portal_selection);
    assert!(!capabilities.display_capture);
    assert!(!capabilities.window_capture);
    assert!(!capabilities.separate_cursor);
    assert!(capabilities.hidden_cursor);
    assert!(capabilities.embedded_cursor);
    assert_product_gate_is_closed(&capabilities);
}

#[test]
fn cursor_modes_are_reported_independently_and_metadata_is_required_for_separate_cursor() {
    let no_metadata =
        evaluate_capabilities(portal_properties(5, true, true, true, true, false), true);
    assert!(no_metadata.portal_selection);
    assert!(no_metadata.hidden_cursor);
    assert!(no_metadata.embedded_cursor);
    assert!(!no_metadata.separate_cursor);
    assert!(!no_metadata.cursor_clicks);
    assert!(!no_metadata.cursor_shapes);

    let metadata_only =
        evaluate_capabilities(portal_properties(5, true, true, false, false, true), true);
    assert!(metadata_only.portal_selection);
    assert!(!metadata_only.hidden_cursor);
    assert!(!metadata_only.embedded_cursor);
    assert!(metadata_only.separate_cursor);
    assert!(!metadata_only.cursor_clicks);
    assert!(!metadata_only.cursor_shapes);
}

const NATIVE_ERROR_CODES: &[(NativeCaptureErrorCode, &str)] = &[
    (
        NativeCaptureErrorCode::PortalUnavailable,
        "portal-unavailable",
    ),
    (
        NativeCaptureErrorCode::PortalVersionUnsupported,
        "portal-version-unsupported",
    ),
    (
        NativeCaptureErrorCode::PortalCursorMetadataUnavailable,
        "portal-cursor-metadata-unavailable",
    ),
    (NativeCaptureErrorCode::PortalCancelled, "portal-cancelled"),
    (NativeCaptureErrorCode::PortalDenied, "portal-denied"),
    (
        NativeCaptureErrorCode::PortalSessionClosed,
        "portal-session-closed",
    ),
    (
        NativeCaptureErrorCode::PortalInvalidStreamResponse,
        "portal-invalid-stream-response",
    ),
    (
        NativeCaptureErrorCode::PipewireConnectFailed,
        "pipewire-connect-failed",
    ),
    (
        NativeCaptureErrorCode::PipewireStreamDisconnected,
        "pipewire-stream-disconnected",
    ),
    (
        NativeCaptureErrorCode::PipewireFormatUnsupported,
        "pipewire-format-unsupported",
    ),
    (
        NativeCaptureErrorCode::PipewireMemoryUnsupported,
        "pipewire-memory-unsupported",
    ),
    (
        NativeCaptureErrorCode::PipewireBufferInvalid,
        "pipewire-buffer-invalid",
    ),
    (
        NativeCaptureErrorCode::PipewireTimestampDiscontinuity,
        "pipewire-timestamp-discontinuity",
    ),
    (
        NativeCaptureErrorCode::ScreenSinkBackpressure,
        "screen-sink-backpressure",
    ),
    (
        NativeCaptureErrorCode::ScreenSinkFailed,
        "screen-sink-failed",
    ),
    (
        NativeCaptureErrorCode::FfmpegUnavailable,
        "ffmpeg-unavailable",
    ),
    (
        NativeCaptureErrorCode::FfmpegEncoderUnavailable,
        "ffmpeg-encoder-unavailable",
    ),
    (NativeCaptureErrorCode::FfmpegFailed, "ffmpeg-failed"),
    (
        NativeCaptureErrorCode::FfmpegOutputInvalid,
        "ffmpeg-output-invalid",
    ),
];

#[test]
fn native_error_codes_serialize_as_stable_kebab_case_values() {
    for (code, expected) in NATIVE_ERROR_CODES {
        let json = serde_json::to_string(code).expect("serialize native error code");
        assert_eq!(json, format!("\"{expected}\""));
        assert_eq!(code.as_str(), *expected);
        assert_eq!(
            serde_json::from_str::<NativeCaptureErrorCode>(&json)
                .expect("deserialize native error code"),
            *code
        );
    }
}

#[test]
fn native_capture_errors_expose_the_same_stable_codes() {
    for (code, expected) in NATIVE_ERROR_CODES {
        let error = CaptureError::Native {
            code: *code,
            message: "fixture detail".into(),
        };

        assert_eq!(error.code(), *expected);
        assert!(error.to_string().starts_with(expected));
    }
}
