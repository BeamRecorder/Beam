use crate::{
    CaptureError,
    model::{CaptureCapabilities, ScreenSelection, SourceDescriptor},
};
pub trait ScreenBackend: Send {
    fn capabilities(&self) -> CaptureCapabilities;
    fn sources(&self) -> Result<Vec<SourceDescriptor>, CaptureError>;
    fn prepare(
        &mut self,
        selection: &ScreenSelection,
        exclude_cursor: bool,
    ) -> Result<(), CaptureError>;
    fn stop(&mut self) -> Result<(), CaptureError>;
}
