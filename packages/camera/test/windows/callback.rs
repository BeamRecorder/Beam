#![cfg(test)]
#![allow(clippy::expect_used)]

use super::*;

#[test]
fn first_media_foundation_failure_survives_later_callback_errors() {
    let state = ReaderState::default();
    state.fail("camera unplugged".into());
    state.fail("callback queue closed".into());
    assert_eq!(state.failure().as_deref(), Some("camera unplugged"));
}

#[test]
fn source_reader_flush_callback_signals_completion() {
    let (sender, receiver) = crossbeam_channel::bounded(1);
    let state = Arc::new(ReaderState::default());
    let callback: IMFSourceReaderCallback = ReaderCallback::new(sender, state.clone()).into();
    unsafe { callback.OnFlush(0) }.expect("flush callback");
    assert!(state.flushed.load(Ordering::Acquire));
    assert!(receiver.try_recv().is_err());
}

#[test]
fn source_reader_callback_preserves_status_flags_and_timestamp() {
    let (sender, receiver) = crossbeam_channel::bounded(1);
    let callback: IMFSourceReaderCallback =
        ReaderCallback::new(sender, Arc::new(ReaderState::default())).into();
    unsafe { callback.OnReadSample(HRESULT(0), 0, 16, 1234, None::<&IMFSample>) }
        .expect("sample callback");
    assert!(matches!(
        receiver.try_recv(),
        Ok(ReaderEvent::Sample {
            status,
            flags: 16,
            timestamp_100ns: 1234,
            sample: None,
        }) if status == HRESULT(0)
    ));
}

#[test]
fn full_reader_event_queue_never_blocks_a_media_foundation_callback() {
    let (sender, receiver) = crossbeam_channel::bounded(1);
    let state = Arc::new(ReaderState::default());
    let callback: IMFSourceReaderCallback = ReaderCallback::new(sender, state.clone()).into();
    unsafe { callback.OnReadSample(HRESULT(0), 0, 0, 1, None::<&IMFSample>) }
        .expect("first callback");
    unsafe { callback.OnReadSample(HRESULT(0), 0, 0, 2, None::<&IMFSample>) }
        .expect("full queue still returns");
    unsafe { callback.OnFlush(0) }.expect("full queue still returns");
    assert!(state.flushed.load(Ordering::Acquire));
    assert!(state.failure().is_some());
    assert!(matches!(
        receiver.try_recv(),
        Ok(ReaderEvent::Sample { .. })
    ));
    assert!(receiver.try_recv().is_err());
}
