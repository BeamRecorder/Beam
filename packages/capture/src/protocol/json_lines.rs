use std::io::{BufRead, Write};

use serde::{Serialize, de::DeserializeOwned};

pub const MAX_LINE_BYTES: usize = 1024 * 1024;

pub fn read_json_line<T: DeserializeOwned>(
    reader: &mut impl BufRead,
) -> Result<Option<T>, crate::CaptureError> {
    let mut bytes = Vec::new();
    let consumed = reader
        .read_until(b'\n', &mut bytes)
        .map_err(|e| crate::CaptureError::Protocol(e.to_string()))?;
    if consumed == 0 {
        return Ok(None);
    }
    if bytes.len() > MAX_LINE_BYTES + 1
        || (bytes.len() == MAX_LINE_BYTES + 1 && bytes.last() != Some(&b'\n'))
    {
        return Err(crate::CaptureError::Protocol(
            "JSONL line exceeds 1 MiB".into(),
        ));
    }
    while matches!(bytes.last(), Some(b'\n' | b'\r')) {
        bytes.pop();
    }
    serde_json::from_slice(&bytes)
        .map(Some)
        .map_err(crate::CaptureError::from)
}

pub fn write_json_line<T: Serialize>(
    writer: &mut impl Write,
    value: &T,
) -> Result<(), crate::CaptureError> {
    serde_json::to_writer(&mut *writer, value)?;
    writer
        .write_all(b"\n")
        .map_err(|e| crate::CaptureError::Protocol(e.to_string()))?;
    writer
        .flush()
        .map_err(|e| crate::CaptureError::Protocol(e.to_string()))
}
