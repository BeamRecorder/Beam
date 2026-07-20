use super::CursorEvent;
use std::{
    fs::OpenOptions,
    io::{BufWriter, Write},
    path::Path,
};
pub struct CursorEventWriter {
    writer: BufWriter<std::fs::File>,
    pending_move: Option<CursorEvent>,
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
            pending_move: None,
        })
    }
    pub fn push(&mut self, event: CursorEvent) -> Result<(), crate::CaptureError> {
        if matches!(event, CursorEvent::Move { .. }) {
            self.pending_move = Some(event);
            return Ok(());
        }
        self.flush_move()?;
        self.write(&event)
    }
    pub fn flush(&mut self) -> Result<(), crate::CaptureError> {
        self.flush_move()?;
        self.writer
            .flush()
            .map_err(|e| crate::CaptureError::Protocol(e.to_string()))
    }
    fn flush_move(&mut self) -> Result<(), crate::CaptureError> {
        if let Some(event) = self.pending_move.take() {
            self.write(&event)?;
        }
        Ok(())
    }
    fn write(&mut self, event: &CursorEvent) -> Result<(), crate::CaptureError> {
        serde_json::to_writer(&mut self.writer, event)?;
        self.writer
            .write_all(b"\n")
            .map_err(|e| crate::CaptureError::Protocol(e.to_string()))
    }
}
