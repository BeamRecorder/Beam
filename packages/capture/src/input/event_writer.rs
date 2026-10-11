use std::{fs::OpenOptions, io::Write, path::Path};

use crate::{
    CaptureError,
    input::{INPUT_SIDECAR_VERSION, InputEvent},
    storage::{JsonlReader, StagedFile},
};

pub struct InputEventWriter {
    file: std::fs::File,
}

pub fn finalize_input_events(partial: &Path, destination: &Path) -> Result<(), CaptureError> {
    let sorted = super::sorted_events::sorted_events(partial)?;
    let mut reader = JsonlReader::<InputEvent>::open(sorted.path())?;
    let mut file = StagedFile::new(destination)?;
    write!(
        file.writer()?,
        "{{\"version\":{INPUT_SIDECAR_VERSION},\"events\":["
    )
    .map_err(|error| CaptureError::storage(destination, error))?;
    let mut first = true;
    while let Some(event) = reader.next_record()? {
        if !first {
            file.writer()?
                .write_all(b",")
                .map_err(|error| CaptureError::storage(destination, error))?;
        }
        first = false;
        serde_json::to_writer(file.writer()?, &event)?;
    }
    file.writer()?
        .write_all(b"]}")
        .map_err(|error| CaptureError::storage(destination, error))?;
    file.publish()?;
    std::fs::remove_file(partial).map_err(|error| CaptureError::storage(partial, error))
}

impl InputEventWriter {
    pub fn open(path: &Path) -> Result<Self, CaptureError> {
        let file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)
            .map_err(|error| CaptureError::storage(path, error))?;
        Ok(Self { file })
    }

    pub fn push(&mut self, event: &InputEvent) -> Result<(), CaptureError> {
        serde_json::to_writer(&mut self.file, event)?;
        self.file
            .write_all(b"\n")
            .map_err(|error| CaptureError::Backend(format!("input sidecar write failed: {error}")))
    }

    pub fn flush(&mut self) -> Result<(), CaptureError> {
        self.file
            .flush()
            .map_err(|error| CaptureError::Backend(format!("input sidecar flush failed: {error}")))
    }
}
