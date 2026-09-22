use std::sync::{
    Arc, Mutex,
    atomic::{AtomicBool, Ordering},
};

use crossbeam_channel::Sender;
use windows::{
    Win32::Media::MediaFoundation::{
        IMFMediaEvent, IMFSample, IMFSourceReaderCallback, IMFSourceReaderCallback_Impl,
    },
    core::{HRESULT, Ref, implement},
};

pub(super) enum ReaderEvent {
    Sample {
        status: HRESULT,
        flags: u32,
        timestamp_100ns: i64,
        sample: Option<IMFSample>,
    },
}

#[derive(Default)]
pub(super) struct ReaderState {
    pub flushed: AtomicBool,
    failure: Mutex<Option<String>>,
}

impl ReaderState {
    fn fail(&self, reason: String) {
        if let Ok(mut failure) = self.failure.lock()
            && failure.is_none()
        {
            *failure = Some(reason);
        }
    }

    pub fn failure(&self) -> Option<String> {
        self.failure.lock().ok().and_then(|failure| failure.clone())
    }
}

#[implement(IMFSourceReaderCallback)]
pub(super) struct ReaderCallback {
    sender: Sender<ReaderEvent>,
    state: Arc<ReaderState>,
}

impl ReaderCallback {
    pub(super) fn new(sender: Sender<ReaderEvent>, state: Arc<ReaderState>) -> Self {
        Self { sender, state }
    }
}

impl IMFSourceReaderCallback_Impl for ReaderCallback_Impl {
    fn OnReadSample(
        &self,
        status: HRESULT,
        _stream_index: u32,
        flags: u32,
        timestamp_100ns: i64,
        sample: Ref<IMFSample>,
    ) -> windows::core::Result<()> {
        if let Err(error) = self.sender.try_send(ReaderEvent::Sample {
            status,
            flags,
            timestamp_100ns,
            sample: sample.cloned(),
        }) {
            self.state
                .fail(format!("Media Foundation callback queue: {error}"));
        }
        Ok(())
    }

    fn OnFlush(&self, _stream_index: u32) -> windows::core::Result<()> {
        self.state.flushed.store(true, Ordering::Release);
        Ok(())
    }

    fn OnEvent(&self, _stream_index: u32, event: Ref<IMFMediaEvent>) -> windows::core::Result<()> {
        if let Some(event) = event.as_ref()
            && let Ok(status) = unsafe { event.GetStatus() }
            && status.is_err()
        {
            self.state
                .fail(format!("Media Foundation source event: {status}"));
        }
        Ok(())
    }
}

#[path = "../../test/windows/callback.rs"]
mod callback_checks;
