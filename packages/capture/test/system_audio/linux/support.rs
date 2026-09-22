#![cfg(test)]
#![allow(clippy::expect_used)]
#![allow(clippy::panic)]

use super::{ReadySender, join, send_ready, set_fatal, take_fatal};
use crate::CaptureError;
use std::sync::{Mutex, mpsc};

#[test]
fn ready_signal_is_sent_once_and_fatal_error_is_consumed_once() {
    let (sender, receiver) = mpsc::sync_channel(1);
    let ready = ReadySender::new(std::cell::RefCell::new(Some(sender)));
    let format = crate::system_audio::SystemAudioFormat {
        sample_rate: 48_000,
        channels: 2,
    };
    send_ready(&ready, Ok(format));
    send_ready(&ready, Err(CaptureError::Backend("late error".into())));
    assert_eq!(receiver.recv().expect("ready").expect("format"), format);

    let fatal = Mutex::new(None);
    set_fatal(&fatal, CaptureError::Backend("first".into()));
    set_fatal(&fatal, CaptureError::Backend("second".into()));
    assert!(
        take_fatal(&fatal)
            .expect_err("fatal")
            .to_string()
            .contains("first")
    );
    assert!(take_fatal(&fatal).is_ok());
}

#[test]
fn join_reports_a_panicking_worker() {
    let mut worker = Some(std::thread::spawn(|| -> Result<(), CaptureError> {
        panic!("test worker panic")
    }));
    assert!(join(&mut worker, "audio writer").is_err());
    assert!(worker.is_none());
    assert!(
        join(&mut worker, "audio writer")
            .expect("absent worker")
            .is_ok()
    );
}
