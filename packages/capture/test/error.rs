use capture::{CaptureError, NativeCaptureErrorCode};

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
