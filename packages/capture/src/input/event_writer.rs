use std::{fs::OpenOptions, io::Write, path::Path};

use crate::{
    CaptureError,
    input::{InputEvent, InputEventSidecar},
    storage::write_atomic,
};

pub struct InputEventWriter {
    file: std::fs::File,
}

pub fn finalize_input_events(partial: &Path, destination: &Path) -> Result<(), CaptureError> {
    let contents =
        std::fs::read_to_string(partial).map_err(|error| CaptureError::storage(partial, error))?;
    let mut events = contents
        .lines()
        .filter(|line| !line.trim().is_empty())
        .map(serde_json::from_str::<InputEvent>)
        .collect::<Result<Vec<_>, _>>()?;
    events.sort_by_key(InputEvent::session_ns);
    write_atomic(
        destination,
        &serde_json::to_vec_pretty(&InputEventSidecar::new(events))?,
    )
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
