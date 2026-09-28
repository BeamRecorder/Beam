//! Shared JSON codec and atomic, locked document storage.

use super::files::{LOCK_EXTENSION, TEMP_EXTENSION};
use fs2::FileExt;
use serde::{Serialize, de::DeserializeOwned};
use serde_json::Value;
use std::{
    fs,
    fs::OpenOptions,
    path::{Path, PathBuf},
};
#[path = "json/types.rs"]
mod types;
pub(crate) use types::ValueResponse;

/// Reads a typed document, distinguishing an absent file from an invalid file.
pub(crate) trait Reader {
    fn read<T: DeserializeOwned>(&self) -> Result<Option<T>, String>;
}

/// Writes a typed document atomically under its exclusive file lock.
pub(crate) trait Writer {
    fn write<T: Serialize>(&self, document: &T) -> Result<(), String>;
}

/// A document path shared by every native Beam storage boundary.
#[derive(Clone)]
pub(crate) struct JsonFile {
    path: PathBuf,
}

impl JsonFile {
    pub(crate) fn new(path: impl Into<PathBuf>) -> Self {
        Self { path: path.into() }
    }
    pub(crate) fn path(&self) -> &Path {
        &self.path
    }

    /// Reads, patches, and commits under one lock; a rejected patch never writes.
    pub(crate) fn update<T: DeserializeOwned + Serialize + Default, R>(
        &self,
        patch: impl FnOnce(&mut T) -> Result<R, String>,
    ) -> Result<R, String> {
        let _lock = self.lock()?;
        let mut document = self.read()?.unwrap_or_default();
        let result = patch(&mut document)?;
        self.write_atomic(&document)?;
        Ok(result)
    }

    fn lock(&self) -> Result<fs::File, String> {
        let parent = self
            .path
            .parent()
            .ok_or("JSON document path has no parent")?;
        fs::create_dir_all(parent).map_err(|error| self.error(error))?;
        let lock = OpenOptions::new()
            .create(true)
            .truncate(false)
            .write(true)
            .open(self.path.with_extension(LOCK_EXTENSION))
            .map_err(|error| self.error(error))?;
        lock.lock_exclusive().map_err(|error| self.error(error))?;
        Ok(lock)
    }

    fn write_atomic<T: Serialize>(&self, document: &T) -> Result<(), String> {
        let bytes = serde_json::to_vec_pretty(document).map_err(|error| self.error(error))?;
        let temporary = self.path.with_extension(TEMP_EXTENSION);
        let mut output = OpenOptions::new()
            .create(true)
            .truncate(true)
            .write(true)
            .open(&temporary)
            .map_err(|error| self.error(error))?;
        use std::io::Write;
        let written = output
            .write_all(&bytes)
            .and_then(|()| output.sync_all())
            .map_err(|error| self.error(error));
        drop(output);
        if let Err(error) = written {
            let _ = fs::remove_file(&temporary);
            return Err(error);
        }
        if let Err(error) = fs::rename(&temporary, &self.path) {
            let _ = fs::remove_file(&temporary);
            return Err(self.error(error));
        }
        Ok(())
    }

    fn error(&self, error: impl std::fmt::Display) -> String {
        format!("{}: {error}", self.path.display())
    }
}

impl Reader for JsonFile {
    fn read<T: DeserializeOwned>(&self) -> Result<Option<T>, String> {
        match fs::read(&self.path) {
            Ok(bytes) => serde_json::from_slice(&bytes)
                .map(Some)
                .map_err(|error| self.error(error)),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(error) => Err(self.error(error)),
        }
    }
}

impl Writer for JsonFile {
    fn write<T: Serialize>(&self, document: &T) -> Result<(), String> {
        let _lock = self.lock()?;
        self.write_atomic(document)
    }
}

/// Serializes a typed service response without constructing JSON fields in handlers.
pub(crate) fn encode<T: Serialize>(value: &T) -> Result<Value, String> {
    serde_json::to_value(value).map_err(|error| error.to_string())
}

/// Decodes a typed boundary payload and preserves field errors from Serde.
pub(crate) fn decode<T: DeserializeOwned>(value: Value) -> Result<T, String> {
    serde_json::from_value(value).map_err(|error| error.to_string())
}

pub(crate) fn parse<T: DeserializeOwned>(source: &str) -> Result<T, String> {
    serde_json::from_str(source).map_err(|error| error.to_string())
}

/// Decodes a bounded UTF-8 network document through the shared typed codec.
pub(crate) fn parse_bytes<T: DeserializeOwned>(source: &[u8]) -> Result<T, String> {
    serde_json::from_slice(source).map_err(|error| error.to_string())
}

pub(crate) fn stringify<T: Serialize>(value: &T) -> Result<String, String> {
    serde_json::to_string(value).map_err(|error| error.to_string())
}

pub(crate) fn error_response(error: String) -> String {
    stringify(&types::ErrorResponse { error }).expect("an error string is JSON serializable")
}

/// Encodes the result of a typed application service, preserving serialization errors.
pub(crate) fn respond<T: Serialize>(result: Result<T, String>) -> crate::ServiceOutcome {
    match result.and_then(|value| encode(&value)) {
        Ok(value) => crate::ServiceOutcome::Ok(value),
        Err(error) => crate::ServiceOutcome::Error(error),
    }
}

#[cfg(test)]
#[path = "../../test/beam/json.rs"]
mod tests;
