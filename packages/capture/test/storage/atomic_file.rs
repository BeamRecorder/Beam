use std::path::Path;

use capture::storage::write_atomic;

#[test]
fn capture_atomic_writer_propagates_invalid_destinations() {
    assert!(write_atomic(Path::new("/"), b"manifest").is_err());
}
