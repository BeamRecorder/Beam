use std::{error::Error, io, path::PathBuf};

use beam_media_encode::EncodeError;

#[test]
fn storage_error_preserves_path_and_io_source() {
    let error = EncodeError::Storage {
        path: PathBuf::from("/missing/session/audio.wav"),
        source: io::Error::new(io::ErrorKind::NotFound, "directory absent"),
    };
    let rendered = error.to_string();
    assert!(rendered.contains("/missing/session/audio.wav"));
    assert!(rendered.contains("directory absent"));
    assert!(error.source().is_some());
}

#[test]
fn clock_and_backpressure_errors_keep_actionable_context() {
    let clock = EncodeError::NonMonotonic {
        pts_ns: 5,
        last_end_ns: 10,
    };
    assert!(clock.to_string().contains("5ns follows 10ns"));
    let queue = EncodeError::QueueFull { kind: "bytes" };
    assert!(queue.to_string().contains("bytes"));
}
