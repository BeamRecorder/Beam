use crate::CaptureError;
use windows::Win32::System::WinRT::{RO_INIT_MULTITHREADED, RoInitialize, RoUninitialize};

/// Each Rust-created worker that calls WinRT owns its matching COM apartment.
pub(crate) struct RuntimeApartment(std::marker::PhantomData<std::rc::Rc<()>>);
impl RuntimeApartment {
    pub(crate) fn initialize() -> Result<Self, CaptureError> {
        unsafe { RoInitialize(RO_INIT_MULTITHREADED) }
            .map_err(|error| CaptureError::Backend(error.to_string()))?;
        Ok(Self(std::marker::PhantomData))
    }
}
impl Drop for RuntimeApartment {
    fn drop(&mut self) {
        unsafe { RoUninitialize() };
    }
}
