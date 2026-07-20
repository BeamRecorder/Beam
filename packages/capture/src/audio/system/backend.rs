use crate::{CaptureError, model::SourceDescriptor};
pub trait SystemAudioBackend: Send {
    fn sources(&self) -> Result<Vec<SourceDescriptor>, CaptureError>;
}
