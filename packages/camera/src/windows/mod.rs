mod callback;
mod capture;
mod catalog;
mod format;
mod sample;

use windows::Win32::Foundation::E_ACCESSDENIED;

use crate::CameraError;

pub use capture::{CameraCapture, open_camera};
pub use catalog::list_cameras;

fn camera_windows_error(
    error: windows::core::Error,
    context: &str,
    fallback: impl FnOnce(String) -> CameraError,
) -> CameraError {
    let message = format!("{context}: {error}");
    if error.code() == E_ACCESSDENIED {
        CameraError::PermissionDenied(message)
    } else {
        fallback(message)
    }
}

#[path = "../../test/windows/error.rs"]
mod error_checks;
