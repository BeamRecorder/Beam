#![allow(clippy::expect_used)]

use std::{
    io::{self, Cursor, Read},
    process::ExitStatus,
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
        mpsc,
    },
    thread,
    time::Duration,
};

use super::input_helper_diagnostics::{HelperDiagnostics, startup_error};
use crate::CaptureError;
use crate::input::InputAccessStatus;
use std::os::unix::process::ExitStatusExt;

fn exit_status(code: i32) -> ExitStatus {
    ExitStatus::from_raw(code << 8)
}

#[test]
fn finish_trims_text_strips_controls_and_replaces_invalid_utf8() {
    let input = b"  \x01ready\n\tcaf\xc3\xa9\x7f\xff  ".to_vec();
    let diagnostics = HelperDiagnostics::start(Cursor::new(input)).expect("start reader");

    assert_eq!(diagnostics.finish(), "ready\n\tcafé\u{FFFD}");
}

#[test]
fn snapshot_returns_while_the_reader_is_blocked() {
    let (started_tx, started_rx) = mpsc::channel();
    let (release_tx, release_rx) = mpsc::channel();
    let diagnostics = HelperDiagnostics::start(GatedReader {
        started: Some(started_tx),
        release: release_rx,
        bytes: Cursor::new(Vec::new()),
    })
    .expect("start gated reader");
    started_rx
        .recv_timeout(Duration::from_secs(2))
        .expect("reader should block waiting for output");

    let snapshot = thread::scope(|scope| {
        let (snapshot_tx, snapshot_rx) = mpsc::channel();
        let diagnostics = &diagnostics;
        scope.spawn(move || {
            let _ = snapshot_tx.send(diagnostics.snapshot());
        });

        let result = snapshot_rx.recv_timeout(Duration::from_millis(500));
        let _ = release_tx.send(b"ready".to_vec());
        drop(release_tx);
        result
    });

    assert_eq!(
        snapshot.expect("snapshot must not wait for reader input"),
        ""
    );
    assert_eq!(diagnostics.finish(), "ready");
}

#[test]
fn finish_drains_output_beyond_the_retention_limit() {
    const OUTPUT_BYTES: usize = 1_048_576;
    let bytes_read = Arc::new(AtomicUsize::new(0));
    let diagnostics = HelperDiagnostics::start(CountingReader {
        remaining: OUTPUT_BYTES,
        bytes_read: Arc::clone(&bytes_read),
    })
    .expect("start counting reader");

    let output = diagnostics.finish();

    assert_eq!(bytes_read.load(Ordering::SeqCst), OUTPUT_BYTES);
    assert_eq!(output.len(), 4_096);
    assert!(output.bytes().all(|byte| byte == b'x'));
}

#[test]
fn finish_keeps_text_read_before_a_reader_error() {
    let diagnostics = HelperDiagnostics::start(ErrorAfterBytes {
        bytes: Cursor::new(b"partial diagnostic".to_vec()),
    })
    .expect("start failing reader");

    assert_eq!(diagnostics.finish(), "partial diagnostic");
}

#[test]
fn startup_error_maps_exit_126_to_cancellation() {
    let error = startup_error(Some(exit_status(126)), "authorization canceled");

    assert!(matches!(error, CaptureError::Cancelled));
}

#[test]
fn startup_error_keeps_exit_status_and_stderr_for_other_codes_including_127() {
    for code in [1, 127] {
        let stderr = "helper executable rejected";
        let error = startup_error(Some(exit_status(code)), stderr);
        let message = error.to_string();

        assert!(matches!(&error, CaptureError::Backend(_)));
        assert!(message.contains(&code.to_string()), "{message}");
        assert!(message.contains(stderr), "{message}");
    }
}

#[test]
fn startup_error_without_output_explains_that_readiness_was_missing() {
    let error = startup_error(None, "");

    assert!(matches!(&error, CaptureError::Backend(_)));
    assert!(error.to_string().to_ascii_lowercase().contains("readiness"));
}

#[test]
fn startup_error_reports_signal_termination() {
    let status = ExitStatus::from_raw(15);
    assert_eq!(status.signal(), Some(15));

    let error = startup_error(Some(status), "helper diagnostics");
    let message = error.to_string().to_ascii_lowercase();

    assert!(matches!(&error, CaptureError::Backend(_)));
    assert!(message.contains("signal"), "{message}");
    assert!(message.contains("15"), "{message}");
    assert!(message.contains("helper diagnostics"), "{message}");
}

#[test]
fn failed_input_access_status_serializes_error_details_and_retry_state() {
    let error = startup_error(Some(exit_status(127)), "polkit could not start the helper");
    let status = InputAccessStatus::failed(&error);
    let value = serde_json::to_value(&status).expect("serialize failed input status");

    assert_eq!(value["state"], "unavailable");
    assert_eq!(value["canRequest"], true);
    assert_eq!(value["error"]["code"], "capture-error");
    assert!(
        value["error"]["message"]
            .as_str()
            .expect("serialized error message")
            .contains("127")
    );
    assert!(
        value["error"]["message"]
            .as_str()
            .expect("serialized error message")
            .contains("polkit could not start the helper")
    );
}

#[test]
fn failed_input_access_status_round_trips_through_json() {
    let error = startup_error(None, "");
    let status = InputAccessStatus::failed(&error);
    let encoded = serde_json::to_vec(&status).expect("serialize failed input status");
    let decoded: InputAccessStatus =
        serde_json::from_slice(&encoded).expect("deserialize failed input status");

    assert_eq!(decoded, status);
    assert!(decoded.can_request);
    assert!(
        decoded
            .error
            .expect("failed status error")
            .message
            .contains("readiness")
    );
}

#[test]
fn available_input_access_status_has_no_serialized_error() {
    let status = InputAccessStatus::available(Some(2), Some(1));
    let value = serde_json::to_value(&status).expect("serialize available input status");

    assert_eq!(value["state"], "available");
    assert_eq!(value["canRequest"], false);
    assert!(value.get("error").is_none());
}

struct CountingReader {
    remaining: usize,
    bytes_read: Arc<AtomicUsize>,
}

impl Read for CountingReader {
    fn read(&mut self, output: &mut [u8]) -> io::Result<usize> {
        let count = self.remaining.min(output.len());
        output[..count].fill(b'x');
        self.remaining -= count;
        self.bytes_read.fetch_add(count, Ordering::SeqCst);
        Ok(count)
    }
}

struct ErrorAfterBytes {
    bytes: Cursor<Vec<u8>>,
}

impl Read for ErrorAfterBytes {
    fn read(&mut self, output: &mut [u8]) -> io::Result<usize> {
        if self.bytes.position() < self.bytes.get_ref().len() as u64 {
            self.bytes.read(output)
        } else {
            Err(io::Error::other("simulated reader failure"))
        }
    }
}

struct GatedReader {
    started: Option<mpsc::Sender<()>>,
    release: mpsc::Receiver<Vec<u8>>,
    bytes: Cursor<Vec<u8>>,
}

impl Read for GatedReader {
    fn read(&mut self, output: &mut [u8]) -> io::Result<usize> {
        if self.bytes.position() < self.bytes.get_ref().len() as u64 {
            return self.bytes.read(output);
        }

        if let Some(started) = self.started.take() {
            let _ = started.send(());
        }

        match self.release.recv() {
            Ok(bytes) => {
                self.bytes = Cursor::new(bytes);
                self.bytes.read(output)
            }
            Err(_) => Ok(0),
        }
    }
}
