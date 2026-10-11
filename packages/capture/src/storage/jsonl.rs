use std::{
    fs::File,
    io::{BufRead, BufReader, Read},
    marker::PhantomData,
    path::{Path, PathBuf},
};

use crate::CaptureError;
use serde::de::DeserializeOwned;

// Capture events contain bounded metadata, never pixel buffers. A damaged or
// malicious journal must not force an allocation proportional to its file size.
pub(crate) const MAX_JSONL_RECORD_BYTES: u64 = 1024 * 1024;

pub(crate) fn read_record(
    reader: &mut impl BufRead,
    bytes: &mut Vec<u8>,
    path: &Path,
) -> Result<usize, CaptureError> {
    bytes.clear();
    let count = reader
        .take(MAX_JSONL_RECORD_BYTES + 1)
        .read_until(b'\n', bytes)
        .map_err(|error| CaptureError::storage(path, error))?;
    if count as u64 > MAX_JSONL_RECORD_BYTES {
        return Err(CaptureError::storage(
            path,
            std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                "capture journal record exceeds 1 MiB",
            ),
        ));
    }
    Ok(count)
}

pub(crate) struct JsonlReader<T> {
    reader: BufReader<File>,
    path: PathBuf,
    bytes: Vec<u8>,
    marker: PhantomData<T>,
}

impl<T: DeserializeOwned> JsonlReader<T> {
    pub(crate) fn open(path: &Path) -> Result<Self, CaptureError> {
        let file = File::open(path).map_err(|error| CaptureError::storage(path, error))?;
        Ok(Self {
            reader: BufReader::new(file),
            path: path.into(),
            bytes: Vec::new(),
            marker: PhantomData,
        })
    }

    pub(crate) fn last_record_bytes(&self) -> usize {
        self.bytes.len()
    }

    pub(crate) fn next_record(&mut self) -> Result<Option<T>, CaptureError> {
        loop {
            if read_record(&mut self.reader, &mut self.bytes, &self.path)? == 0 {
                return Ok(None);
            }
            if self.bytes.iter().all(u8::is_ascii_whitespace) {
                continue;
            }
            return serde_json::from_slice(&self.bytes)
                .map(Some)
                .map_err(|source| CaptureError::JsonFile {
                    path: self.path.display().to_string(),
                    source,
                });
        }
    }
}
