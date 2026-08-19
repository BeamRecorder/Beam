#![cfg(target_os = "linux")]
#![allow(clippy::expect_used)]

use capture::{
    CaptureError, NativeCaptureErrorCode,
    catalog::CatalogSnapshot,
    model::{
        CaptureCapabilities, CaptureDiagnostics, FfmpegDiagnostic, LinuxCaptureDiagnostics,
        PermissionSnapshot, PortalDiagnostic, RequirementDiagnostic,
    },
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

fn assert_product_gate(capabilities: &LinuxNativeCapabilities, expected: bool) {
    assert_eq!(capabilities.recording_available, expected);
}

#[test]
fn portal_version_one_disables_portal_capture_even_with_all_features() {
    let capabilities = evaluate_capabilities(
        portal_properties(1, true, true, true, true, true),
        true,
        true,
    );

    assert_eq!(capabilities.backend, "xdg-portal-pipewire");
    assert_eq!(capabilities.portal_version, 1);
    assert!(!capabilities.portal_selection);
    assert!(!capabilities.display_capture);
    assert!(!capabilities.window_capture);
    assert!(!capabilities.separate_cursor);
    assert!(capabilities.hidden_cursor);
    assert!(capabilities.embedded_cursor);
    assert!(!capabilities.cursor_shapes);
    assert!(capabilities.pipewire_available);
    assert_product_gate(&capabilities, false);
}

#[test]
fn portal_version_two_is_the_minimum_supported_version() {
    let capabilities = evaluate_capabilities(
        portal_properties(2, true, true, true, true, true),
        true,
        true,
    );

    assert_eq!(capabilities.portal_version, 2);
    assert!(capabilities.portal_selection);
    assert!(capabilities.display_capture);
    assert!(capabilities.window_capture);
    assert!(capabilities.separate_cursor);
    assert_product_gate(&capabilities, true);
}

#[test]
fn portal_versions_above_two_keep_the_same_contract() {
    for version in [3, 5, 42] {
        let capabilities = evaluate_capabilities(
            portal_properties(version, true, true, false, true, true),
            true,
            true,
        );

        assert_eq!(capabilities.portal_version, version);
        assert!(capabilities.portal_selection);
        assert!(capabilities.display_capture);
        assert!(capabilities.window_capture);
        assert!(!capabilities.hidden_cursor);
        assert!(capabilities.embedded_cursor);
        assert!(capabilities.separate_cursor);
        assert_product_gate(&capabilities, true);
    }
}

#[test]
fn monitor_only_source_supports_display_but_not_window_capture() {
    let capabilities = evaluate_capabilities(
        portal_properties(5, true, false, true, false, true),
        true,
        true,
    );

    assert!(capabilities.portal_selection);
    assert!(capabilities.display_capture);
    assert!(!capabilities.window_capture);
    assert!(capabilities.hidden_cursor);
    assert!(!capabilities.embedded_cursor);
    assert!(capabilities.separate_cursor);
    assert_product_gate(&capabilities, true);
}

#[test]
fn window_only_source_supports_window_but_not_display_capture() {
    let capabilities = evaluate_capabilities(
        portal_properties(5, false, true, false, true, true),
        true,
        true,
    );

    assert!(capabilities.portal_selection);
    assert!(!capabilities.display_capture);
    assert!(capabilities.window_capture);
    assert!(!capabilities.hidden_cursor);
    assert!(capabilities.embedded_cursor);
    assert!(capabilities.separate_cursor);
    assert_product_gate(&capabilities, true);
}

#[test]
fn missing_source_types_disable_portal_selection() {
    let capabilities = evaluate_capabilities(
        portal_properties(5, false, false, true, true, true),
        true,
        true,
    );

    assert!(!capabilities.portal_selection);
    assert!(!capabilities.display_capture);
    assert!(!capabilities.window_capture);
    assert!(!capabilities.separate_cursor);
    assert!(capabilities.hidden_cursor);
    assert!(capabilities.embedded_cursor);
    assert_product_gate(&capabilities, false);
}

#[test]
fn unavailable_pipewire_disables_all_capture_paths() {
    let capabilities = evaluate_capabilities(
        portal_properties(5, true, true, true, true, true),
        false,
        true,
    );

    assert!(!capabilities.pipewire_available);
    assert!(!capabilities.portal_selection);
    assert!(!capabilities.display_capture);
    assert!(!capabilities.window_capture);
    assert!(!capabilities.separate_cursor);
    assert!(capabilities.hidden_cursor);
    assert!(capabilities.embedded_cursor);
    assert_product_gate(&capabilities, false);
}

#[test]
fn unavailable_ffmpeg_keeps_portal_selection_but_closes_recording_gate() {
    let capabilities = evaluate_capabilities(
        portal_properties(5, true, true, true, true, true),
        true,
        false,
    );

    assert!(capabilities.pipewire_available);
    assert!(capabilities.portal_selection);
    assert!(capabilities.display_capture);
    assert!(capabilities.window_capture);
    assert_product_gate(&capabilities, false);
}

#[test]
fn cursor_modes_are_reported_independently_and_metadata_is_required_for_separate_cursor() {
    let no_metadata = evaluate_capabilities(
        portal_properties(5, true, true, true, true, false),
        true,
        true,
    );
    assert!(no_metadata.portal_selection);
    assert!(no_metadata.hidden_cursor);
    assert!(no_metadata.embedded_cursor);
    assert!(!no_metadata.separate_cursor);
    assert!(!no_metadata.cursor_shapes);
    assert_product_gate(&no_metadata, true);

    let metadata_only = evaluate_capabilities(
        portal_properties(5, true, true, false, false, true),
        true,
        true,
    );
    assert!(metadata_only.portal_selection);
    assert!(!metadata_only.hidden_cursor);
    assert!(!metadata_only.embedded_cursor);
    assert!(metadata_only.separate_cursor);
    assert!(metadata_only.cursor_shapes);
    assert_product_gate(&metadata_only, true);
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

#[test]
fn linux_diagnostics_serialize_as_a_stable_camel_case_contract() {
    let diagnostics = CaptureDiagnostics {
        platform: "linux".into(),
        linux: Some(LinuxCaptureDiagnostics {
            distribution: Some("Debian GNU/Linux 13 (trixie)".into()),
            distribution_id: Some("debian".into()),
            distribution_like: Vec::new(),
            distribution_version: Some("13".into()),
            kernel: Some("6.12.0-amd64".into()),
            architecture: "x86_64".into(),
            desktop: Some("GNOME".into()),
            session_type: "x11".into(),
            display_server: "x11".into(),
            backend: "xdg-portal-pipewire".into(),
            portal: PortalDiagnostic {
                available: true,
                version: Some(5),
                monitor: Some(true),
                window: Some(true),
                metadata_cursor: Some(true),
                error_code: None,
                detail: None,
            },
            pipewire: RequirementDiagnostic {
                available: true,
                error_code: None,
                detail: Some("PipeWire connection succeeded".into()),
            },
            ffmpeg: FfmpegDiagnostic {
                available: true,
                encoder: Some("libx264".into()),
                codec: Some("h264".into()),
                hardware: Some(false),
                error_code: None,
                detail: None,
            },
            recording_available: true,
        }),
    };

    let value = serde_json::to_value(diagnostics).expect("serialize Linux diagnostics");
    assert_eq!(value["platform"], "linux");
    assert_eq!(value["linux"]["sessionType"], "x11");
    assert_eq!(value["linux"]["displayServer"], "x11");
    assert_eq!(value["linux"]["distributionId"], "debian");
    assert_eq!(value["linux"]["distributionLike"], serde_json::json!([]));
    assert_eq!(value["linux"]["distributionVersion"], "13");
    assert_eq!(value["linux"]["recordingAvailable"], true);
    assert_eq!(value["linux"]["portal"]["metadataCursor"], true);
    assert_eq!(value["linux"]["ffmpeg"]["encoder"], "libx264");
    assert!(value["linux"].get("session_type").is_none());
    assert!(value["linux"].get("distribution_id").is_none());
    assert!(value["linux"].get("distribution_version").is_none());
    assert!(value["linux"]["portal"].get("metadata_cursor").is_none());
    assert!(value["linux"]["ffmpeg"].get("error_code").is_none());
}

#[test]
fn linux_diagnostics_preserve_independent_requirement_failures() {
    let diagnostics = LinuxCaptureDiagnostics {
        portal: PortalDiagnostic {
            available: false,
            version: Some(1),
            monitor: Some(true),
            window: Some(false),
            metadata_cursor: Some(false),
            error_code: Some("portal-version-unsupported".into()),
            detail: Some("ScreenCast portal version 1 is unsupported".into()),
        },
        pipewire: RequirementDiagnostic {
            available: true,
            error_code: None,
            detail: Some("PipeWire connection succeeded".into()),
        },
        ffmpeg: FfmpegDiagnostic {
            available: false,
            encoder: None,
            codec: None,
            hardware: None,
            error_code: Some("ffmpeg-encoder-unavailable".into()),
            detail: Some("No supported encoder".into()),
        },
        recording_available: false,
        ..LinuxCaptureDiagnostics::default()
    };

    assert!(!diagnostics.recording_available);
    assert!(!diagnostics.portal.available);
    assert!(diagnostics.pipewire.available);
    assert!(!diagnostics.ffmpeg.available);
    assert_eq!(
        diagnostics.portal.error_code.as_deref(),
        Some("portal-version-unsupported")
    );
    assert_eq!(
        diagnostics.ffmpeg.error_code.as_deref(),
        Some("ffmpeg-encoder-unavailable")
    );
}

#[test]
fn catalog_snapshot_accepts_legacy_payloads_without_diagnostics() {
    let payload = serde_json::json!({
        "generation": 7,
        "createdAtUtc": "2026-01-01T00:00:00Z",
        "capabilities": CaptureCapabilities::default(),
        "permissions": PermissionSnapshot::default(),
        "limitations": [],
        "sources": []
    });

    let snapshot: CatalogSnapshot =
        serde_json::from_value(payload).expect("legacy catalog must remain readable");
    assert_eq!(snapshot.generation, 7);
    assert_eq!(snapshot.diagnostics, CaptureDiagnostics::default());
}
