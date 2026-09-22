#![allow(clippy::expect_used)]

use beam_media_manifest::{ManifestError, SourceId, write_atomic};

#[test]
fn storage_error_reports_the_failed_path_and_source() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let path = temporary.path().join("missing").join("manifest.json");
    let error = write_atomic(&path, b"data").expect_err("missing directory");
    assert!(matches!(error, ManifestError::Storage { .. }), "{error}");
    if let ManifestError::Storage {
        path: failed,
        source,
    } = error
    {
        assert_eq!(failed, path.with_file_name("manifest.json.tmp"));
        assert_eq!(source.kind(), std::io::ErrorKind::NotFound);
    }
}

#[test]
fn invalid_source_id_has_actionable_error_text() {
    let error = SourceId::new(" ").expect_err("blank ID");
    assert!(matches!(error, ManifestError::InvalidSourceId));
    assert!(error.to_string().contains("1..=1024"));
}
