use super::CursorEvent;
use std::{
    fs::OpenOptions,
    io::{BufWriter, Write},
    path::Path,
};
pub struct CursorEventWriter {
    writer: BufWriter<std::fs::File>,
}
impl CursorEventWriter {
    pub fn open(path: &Path) -> Result<Self, crate::CaptureError> {
        let file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)
            .map_err(|e| crate::CaptureError::storage(path, e))?;
        Ok(Self {
            writer: BufWriter::new(file),
        })
    }
    pub fn push(&mut self, event: CursorEvent) -> Result<(), crate::CaptureError> {
        self.write(&event)
    }
    pub fn flush(&mut self) -> Result<(), crate::CaptureError> {
        self.writer
            .flush()
            .map_err(|e| crate::CaptureError::Protocol(e.to_string()))
    }
    fn write(&mut self, event: &CursorEvent) -> Result<(), crate::CaptureError> {
        serde_json::to_writer(&mut self.writer, event)?;
        self.writer
            .write_all(b"\n")
            .map_err(|e| crate::CaptureError::Protocol(e.to_string()))
    }
}
