use std::sync::OnceLock;

use crate::{CaptureError, NativeCaptureErrorCode};

static PORTAL_RUNTIME: OnceLock<Result<tokio::runtime::Runtime, String>> = OnceLock::new();

pub(super) fn portal_runtime() -> Result<&'static tokio::runtime::Runtime, CaptureError> {
    match PORTAL_RUNTIME.get_or_init(|| {
        tokio::runtime::Builder::new_multi_thread()
            .thread_name("beam-linux-portal-runtime")
            .enable_all()
            .build()
            .map_err(|error| error.to_string())
    }) {
        Ok(runtime) => Ok(runtime),
        Err(error) => Err(CaptureError::native(
            NativeCaptureErrorCode::PortalUnavailable,
            format!("failed to initialize the shared ScreenCast Portal runtime: {error}"),
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::portal_runtime;

    #[test]
    fn portal_runtime_reuses_the_same_instance() {
        let first = portal_runtime().expect("first Portal runtime");
        let second = portal_runtime().expect("second Portal runtime");

        assert!(std::ptr::eq(first, second));
    }
}
