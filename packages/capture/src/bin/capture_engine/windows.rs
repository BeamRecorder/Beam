use windows::Win32::{
    System::Threading::GetCurrentProcess,
    UI::HiDpi::{
        AreDpiAwarenessContextsEqual, DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2,
        GetDpiAwarenessContextForProcess, SetProcessDpiAwarenessContext,
    },
};

pub(super) struct RuntimeApartment;
impl RuntimeApartment {
    pub(super) fn initialize() -> Result<Self, capture::CaptureError> {
        use windows::Win32::System::WinRT::{RO_INIT_MULTITHREADED, RoInitialize};
        // Protocol status can publish a retained GPU image for a static source.
        // Keep the protocol thread in an MTA as well as the WGC worker threads.
        unsafe { RoInitialize(RO_INIT_MULTITHREADED) }
            .map_err(|error| capture::CaptureError::Backend(error.to_string()))?;
        Ok(Self)
    }
}
impl Drop for RuntimeApartment {
    fn drop(&mut self) {
        unsafe { windows::Win32::System::WinRT::RoUninitialize() };
    }
}

pub(super) fn configure_windows_dpi_awareness() -> Result<(), capture::CaptureError> {
    // This process owns no UI. Set its coordinate system before discovery creates
    // WGC items or worker threads so frames, source bounds and cursor positions
    // all use physical per-monitor pixels.
    // SAFETY: PMv2 is supported by every Windows version that supports WGC.
    let error = match unsafe {
        SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2)
    } {
        Ok(()) => return Ok(()),
        Err(error) => error,
    };
    // SAFETY: the current-process pseudo-handle is always valid and needs no close.
    let process = unsafe { GetCurrentProcess() };
    // SAFETY: querying the current process needs no caller-owned storage.
    let current = unsafe { GetDpiAwarenessContextForProcess(process) };
    // SAFETY: both handles are valid queried/predefined DPI contexts.
    if unsafe { AreDpiAwarenessContextsEqual(current, DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2) }
        .as_bool()
    {
        return Ok(());
    }
    Err(capture::CaptureError::Backend(format!(
        "Windows capture engine could not enable per-monitor DPI awareness: {error}",
    )))
}
