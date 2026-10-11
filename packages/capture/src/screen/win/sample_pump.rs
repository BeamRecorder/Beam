use crate::CaptureError;
use crossbeam_channel::{Receiver, Sender, bounded, select};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use windows::{
    Foundation::TypedEventHandler,
    Media::Core::{
        MediaStreamSample, MediaStreamSource, MediaStreamSourceSampleRequest,
        MediaStreamSourceSampleRequestDeferral,
    },
};

static ACTIVE: AtomicBool = AtomicBool::new(false);
struct WorkerPermit;
impl Drop for WorkerPermit {
    fn drop(&mut self) {
        ACTIVE.store(false, Ordering::Release);
    }
}

type Request = (
    MediaStreamSourceSampleRequest,
    MediaStreamSourceSampleRequestDeferral,
);

/// One bounded worker per source, rather than one blocking Windows thread-pool
/// work item per frame request. Cancellation also releases outstanding deferrals.
pub(super) struct SamplePump {
    source: MediaStreamSource,
    token: Option<i64>,
    cancel: Option<Sender<()>>,
    worker: Option<JoinHandle<Result<(), CaptureError>>>,
    failure: Arc<Mutex<Option<String>>>,
}

impl SamplePump {
    pub(super) fn attach(
        source: &MediaStreamSource,
        frames: Receiver<MediaStreamSample>,
    ) -> Result<Self, String> {
        ACTIVE
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .map_err(|_| {
                "previous Windows sample worker is still stopping; media was preserved".to_owned()
            })?;
        let permit = WorkerPermit;
        let (requests, pending) = bounded::<Request>(1);
        let (cancel, cancelled) = bounded(1);
        let failure = Arc::new(Mutex::new(None));
        let worker_failure = failure.clone();
        let callback_failure = failure.clone();
        let token = source.SampleRequested(&TypedEventHandler::new(move |_, args: windows::core::Ref<windows::Media::Core::MediaStreamSourceSampleRequestedEventArgs>| {
            let request = args.ok()?.Request()?;
            let deferral = request.GetDeferral()?;
            if let Err(error) = requests.try_send((request, deferral)) {
                let (request, deferral) = error.into_inner();
                let result = request.SetSample(None).and(deferral.Complete());
                *callback_failure.lock().unwrap_or_else(std::sync::PoisonError::into_inner) = Some("Windows media source requested more frames than its bounded worker can supply".into());
                result?;
            }
            Ok(())
        })).map_err(|error| error.to_string())?;
        let result = std::thread::Builder::new().name("beam-wgc-samples".into()).spawn(move || {
            let _permit = permit;
            let apartment = super::RuntimeApartment::initialize();
            if let Err(error) = &apartment {
                let message = error.to_string();
                *worker_failure.lock().unwrap_or_else(std::sync::PoisonError::into_inner) = Some(message.clone());
                return Err(CaptureError::Backend(message));
            }
            let _apartment = apartment?;
            loop {
                let (request, deferral) = select! {
                    recv(cancelled) -> _ => break,
                    recv(pending) -> request => match request { Ok(request) => request, Err(_) => break },
                };
                let sample = select! {
                    recv(cancelled) -> _ => None,
                    recv(frames) -> frame => frame.ok(),
                };
                let result = request.SetSample(sample.as_ref());
                let completed = deferral.Complete();
                if let Err(error) = result.and(completed) {
                    *worker_failure.lock().unwrap_or_else(std::sync::PoisonError::into_inner) = Some(error.to_string());
                    break;
                }
            }
            for (request, deferral) in pending.try_iter() {
                let _ = request.SetSample(None);
                let _ = deferral.Complete();
            }
            Ok(())
        });
        let worker = result.map_err(|error| {
            let _ = source.RemoveSampleRequested(token);
            error.to_string()
        })?;
        Ok(Self {
            source: source.clone(),
            token: Some(token),
            cancel: Some(cancel),
            worker: Some(worker),
            failure,
        })
    }
    pub(super) fn check(&self) -> Result<(), String> {
        let failure = self
            .failure
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .clone()
            .map_or(Ok(()), Err);
        failure?;
        if self.cancel.is_some() && self.worker.as_ref().is_some_and(JoinHandle::is_finished) {
            return Err("Windows sample worker stopped unexpectedly".into());
        }
        Ok(())
    }
    pub(super) fn stop(&mut self) -> Result<(), String> {
        self.cancel.take();
        if let Some(token) = self.token.take() {
            let _ = self.source.RemoveSampleRequested(token);
        }
        if let Some(worker) = self.worker.take() {
            crate::session::join_worker(worker, "Windows sample worker")
                .map_err(|error| error.to_string())?;
        }
        self.check()
    }
}
impl Drop for SamplePump {
    fn drop(&mut self) {
        let _ = self.stop();
    }
}
