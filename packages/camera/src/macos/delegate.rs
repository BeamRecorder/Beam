use std::sync::{
    Arc, Mutex,
    atomic::{AtomicU64, Ordering},
};

use crossbeam_channel::Sender;
use objc2::{AnyThread, DefinedClass, define_class, msg_send, rc::Retained};
use objc2_av_foundation::{
    AVCaptureConnection, AVCaptureOutput, AVCaptureVideoDataOutputSampleBufferDelegate,
};
use objc2_core_media::CMSampleBuffer;
use objc2_foundation::{NSObject, NSObjectProtocol};

use crate::{CameraEvent, CameraFormat};

use super::{pixel::copy_sample, types::OwnedSample};

#[derive(Default)]
pub(super) struct CallbackState {
    failure: Mutex<Option<String>>,
    sequence: AtomicU64,
}

impl CallbackState {
    fn fail(&self, reason: String) {
        if let Ok(mut failure) = self.failure.lock()
            && failure.is_none()
        {
            *failure = Some(reason);
        }
    }

    pub(super) fn failure(&self) -> Option<String> {
        self.failure.lock().ok().and_then(|failure| failure.clone())
    }

    fn next_sequence(&self) -> u64 {
        self.sequence
            .fetch_update(Ordering::AcqRel, Ordering::Acquire, |value| {
                Some(value.saturating_add(1))
            })
            .unwrap_or_else(|value| value)
            .saturating_add(1)
    }
}

pub(super) struct DelegateIvars {
    samples: Sender<OwnedSample>,
    events: Sender<CameraEvent>,
    state: Arc<CallbackState>,
    selected: CameraFormat,
    max_bytes: usize,
}

define_class!(
    #[unsafe(super(NSObject))]
    #[ivars = DelegateIvars]
    pub(super) struct CameraDelegate;

    unsafe impl NSObjectProtocol for CameraDelegate {}

    #[allow(non_snake_case)]
    unsafe impl AVCaptureVideoDataOutputSampleBufferDelegate for CameraDelegate {
        #[unsafe(method(captureOutput:didOutputSampleBuffer:fromConnection:))]
        unsafe fn captureOutput_didOutputSampleBuffer_fromConnection(
            &self,
            _output: &AVCaptureOutput,
            sample_buffer: &CMSampleBuffer,
            _connection: &AVCaptureConnection,
        ) {
            let ivars = self.ivars();
            if ivars.state.failure().is_some() {
                return;
            }
            let sequence = ivars.state.next_sequence();
            match copy_sample(sample_buffer, ivars.selected, ivars.max_bytes) {
                Ok(mut sample) => {
                    sample.sequence = sequence;
                    if ivars.samples.try_send(sample).is_err() {
                        let _ = ivars.events.try_send(CameraEvent::Dropped { sequence });
                    }
                }
                Err(error) => ivars.state.fail(error.to_string()),
            }
        }

        #[unsafe(method(captureOutput:didDropSampleBuffer:fromConnection:))]
        unsafe fn captureOutput_didDropSampleBuffer_fromConnection(
            &self,
            _output: &AVCaptureOutput,
            _sample_buffer: &CMSampleBuffer,
            _connection: &AVCaptureConnection,
        ) {
            let ivars = self.ivars();
            let sequence = ivars.state.next_sequence();
            let _ = ivars.events.try_send(CameraEvent::Dropped { sequence });
        }
    }
);

impl CameraDelegate {
    pub(super) fn new(
        samples: Sender<OwnedSample>,
        events: Sender<CameraEvent>,
        state: Arc<CallbackState>,
        selected: CameraFormat,
        max_bytes: usize,
    ) -> Retained<Self> {
        let this = Self::alloc().set_ivars(DelegateIvars {
            samples,
            events,
            state,
            selected,
            max_bytes,
        });
        unsafe { msg_send![super(this), init] }
    }
}

#[path = "../../test/macos/delegate.rs"]
mod delegate_checks;
