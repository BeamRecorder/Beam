use super::capture_handler::{CaptureHandler, CaptureHealth};
use crate::CaptureError;
use parking_lot::Mutex;
use std::{
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    thread::JoinHandle,
    time::{Duration, Instant},
};

/// Keep native COM work off the protocol's Status path. The owned worker also
/// supplies periodic samples for WGC sources whose image does not change.
pub(super) fn start(
    callback: Arc<Mutex<CaptureHandler>>,
    health: Arc<Mutex<CaptureHealth>>,
    stopping: Arc<AtomicBool>,
) -> Result<JoinHandle<Result<(), CaptureError>>, CaptureError> {
    std::thread::Builder::new()
        .name("beam-wgc-health".into())
        .spawn(move || {
            let _apartment = super::RuntimeApartment::initialize()
                .inspect_err(|error| health.lock().fail(error))?;
            while !stopping.load(Ordering::Acquire) {
                if let Some(mut handler) = callback.try_lock() {
                    health.lock().callback_since = Some(Instant::now());
                    let result = handler.probe();
                    let mut health = health.lock();
                    health.callback_since = None;
                    if let Err(error) = result {
                        health.fail(&error);
                        return Err(CaptureError::Backend(error));
                    }
                }
                std::thread::sleep(Duration::from_millis(250));
            }
            Ok(())
        })
        .map_err(|error| {
            CaptureError::Backend(format!(
                "could not start Windows capture health worker: {error}"
            ))
        })
}
