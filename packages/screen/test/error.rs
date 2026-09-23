use beam_screen::{CaptureError, NativeCaptureErrorCode};

#[test]
fn manifest_storage_failure_keeps_its_path_in_capture_error() {
    let original = beam_media_manifest::ManifestError::Storage {
        path: std::path::PathBuf::from("/tmp/session/manifest.json"),
        source: std::io::Error::from(std::io::ErrorKind::PermissionDenied),
    };
    let converted: CaptureError = original.into();
    assert_eq!(converted.code(), "storage-error");
    assert!(converted.to_string().contains("/tmp/session/manifest.json"));
    assert_eq!(
        NativeCaptureErrorCode::PipewireBufferInvalid.as_str(),
        "pipewire-buffer-invalid"
    );
}
#[test]
fn portable_failures_keep_stable_machine_codes_and_messages() {
    use CaptureError as E;
    for (error, code) in [
        (
            E::InvalidConfiguration("bad region".into()),
            "invalid-configuration",
        ),
        (E::SourceNotFound("gone".into()), "source-not-found"),
        (E::Unsupported("route".into()), "unsupported-operation"),
        (E::PermissionDenied("camera".into()), "permission-denied"),
        (
            E::InvalidTransition {
                from: "idle".into(),
                to: "pause".into(),
            },
            "invalid-transition",
        ),
        (E::Protocol("version".into()), "protocol-error"),
        (E::Backend("lost".into()), "capture-error"),
        (E::Cancelled, "cancelled"),
        (
            E::ParentDeathGuard("unavailable".into()),
            "parent-death-guard-unavailable",
        ),
        (
            beam_media_manifest::ManifestError::InvalidPath.into(),
            "invalid-configuration",
        ),
        (
            beam_media_manifest::ManifestError::InvalidSourceId.into(),
            "invalid-configuration",
        ),
        (
            beam_media_manifest::ManifestError::Serialization(
                serde_json::from_str::<bool>("bad").unwrap_err(),
            )
            .into(),
            "serialization-error",
        ),
    ] {
        assert_eq!(error.code(), code);
        assert!(!error.to_string().is_empty());
    }
}
#[test]
fn all_native_error_tags_roundtrip_through_json() {
    for tag in [
        "portal-unavailable",
        "portal-version-unsupported",
        "portal-cursor-metadata-unavailable",
        "portal-cancelled",
        "portal-denied",
        "portal-session-closed",
        "portal-invalid-stream-response",
        "pipewire-connect-failed",
        "pipewire-stream-disconnected",
        "pipewire-format-unsupported",
        "pipewire-memory-unsupported",
        "pipewire-buffer-invalid",
        "pipewire-timestamp-discontinuity",
        "screen-sink-backpressure",
        "screen-sink-failed",
    ] {
        let code: NativeCaptureErrorCode = serde_json::from_value(serde_json::json!(tag)).unwrap();
        assert_eq!(code.as_str(), tag);
        assert_eq!(
            CaptureError::Native {
                code,
                message: "fixture".into()
            }
            .code(),
            tag
        );
    }
}
