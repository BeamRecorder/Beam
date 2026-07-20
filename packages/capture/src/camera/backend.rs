use crate::{
    CaptureError,
    model::{CameraSelection, MediaFormat},
};
pub trait CameraBackend: Send {
    fn start(&mut self, selection: &CameraSelection) -> Result<MediaFormat, CaptureError>;
    fn stop(&mut self) -> Result<(), CaptureError>;
}
