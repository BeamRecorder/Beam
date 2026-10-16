use std::time::{Duration, Instant};
use windows::core::RuntimeType;
use windows_future::{AsyncOperationCompletedHandler, AsyncStatus, IAsyncOperation};

pub(super) fn wait<T: RuntimeType>(
    operation: IAsyncOperation<T>,
    deadline: Instant,
) -> windows::core::Result<T> {
    if operation.Status()? == AsyncStatus::Started {
        let (sender, receiver) = crossbeam_channel::bounded(1);
        operation.SetCompleted(&AsyncOperationCompletedHandler::new(move |_, _| {
            let _ = sender.try_send(());
            Ok(())
        }))?;
        if receiver
            .recv_timeout(deadline.saturating_duration_since(Instant::now()))
            .is_err()
        {
            let _ = operation.Cancel();
            return Err(windows::core::Error::new(
                windows::core::HRESULT(0x800705B4_u32 as i32),
                "Windows encoder initialization exceeded its deadline",
            ));
        }
    }
    operation.GetResults()
}

pub(super) fn initialization_deadline() -> Instant {
    Instant::now() + Duration::from_secs(10)
}

#[cfg(test)]
mod tests {
    #![allow(clippy::expect_used)]
    use super::*;

    #[test]
    fn completed_results_and_native_errors_are_preserved() {
        assert_eq!(
            wait(IAsyncOperation::<u32>::ready(Ok(42)), Instant::now()).expect("ready"),
            42
        );
        let error = windows::core::Error::new(
            windows::core::HRESULT(0x80004005_u32 as i32),
            "codec unavailable",
        );
        let result = wait(
            IAsyncOperation::<u32>::ready(Err(error.clone())),
            initialization_deadline(),
        );
        assert_eq!(result.expect_err("native failure").code(), error.code());
    }

    #[test]
    fn async_type_negotiation_failure_keeps_its_hresult_for_encoder_selection() {
        let error = windows::core::Error::new(
            windows::core::HRESULT(0xC00D6D60_u32 as i32),
            "type not set",
        );
        let result = wait(
            IAsyncOperation::<u32>::spawn(move || Err(error)),
            initialization_deadline(),
        );
        assert_eq!(
            result.expect_err("type negotiation").code().0 as u32,
            0xC00D6D60
        );
    }

    #[test]
    fn a_blocked_winrt_operation_has_a_finite_wait() {
        let (release, blocked) = std::sync::mpsc::channel();
        let (done, finished) = std::sync::mpsc::channel();
        let operation = IAsyncOperation::<u32>::spawn(move || {
            blocked.recv().expect("release");
            done.send(()).expect("signal");
            Ok(7)
        });
        let started = Instant::now();
        let result = wait(operation, started + Duration::from_millis(20));
        release.send(()).expect("release worker");
        finished
            .recv_timeout(Duration::from_secs(1))
            .expect("cleanup");
        assert!(
            result
                .expect_err("deadline")
                .to_string()
                .contains("deadline")
        );
        assert!(started.elapsed() < Duration::from_secs(1));
    }
}
