#![cfg(test)]
#![allow(clippy::expect_used)]

use std::os::unix::fs::PermissionsExt;

use super::{install_bytes, install_file};

#[test]
fn helper_install_replaces_bytes_and_preserves_mode() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let destination = temporary.path().join("libexec").join("beam-input-helper");
    install_bytes(b"first", &destination, 0o755).expect("first installation");
    assert_eq!(std::fs::read(&destination).expect("installed"), b"first");
    assert_eq!(
        std::fs::metadata(&destination)
            .expect("metadata")
            .permissions()
            .mode()
            & 0o777,
        0o755
    );
    let source = temporary.path().join("source");
    std::fs::write(&source, b"second").expect("source");
    install_file(&source, &destination, 0o644).expect("replacement");
    assert_eq!(std::fs::read(&destination).expect("replaced"), b"second");
    assert_eq!(
        std::fs::metadata(&destination)
            .expect("metadata")
            .permissions()
            .mode()
            & 0o777,
        0o644
    );
}
