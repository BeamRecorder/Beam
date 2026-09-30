use crate::CaptureError;
use serde::{Serialize, de::DeserializeOwned};
use std::{
    collections::{BTreeSet, HashMap},
    path::{Path, PathBuf},
};

/// A serialized document ready for a batch, including documents of different types.
pub struct JsonWrite {
    path: PathBuf,
    bytes: Vec<u8>,
}

impl JsonWrite {
    pub fn new<T: Serialize + ?Sized>(
        path: impl Into<PathBuf>,
        value: &T,
    ) -> Result<Self, CaptureError> {
        let path = path.into();
        let bytes = serde_json::to_vec_pretty(value).map_err(|source| CaptureError::JsonFile {
            path: path.display().to_string(),
            source,
        })?;
        Ok(Self { path, bytes })
    }
}

pub fn read_json<T: DeserializeOwned>(path: &Path) -> Result<T, CaptureError> {
    let bytes = std::fs::read(path).map_err(|error| CaptureError::storage(path, error))?;
    serde_json::from_slice(&bytes).map_err(|source| CaptureError::JsonFile {
        path: path.display().to_string(),
        source,
    })
}

pub fn write_json_atomic<T: Serialize + ?Sized>(
    path: &Path,
    value: &T,
) -> Result<(), CaptureError> {
    write_json_batch([JsonWrite::new(path, value)?])
}

/// Stages every file before publication, deduplicates destinations (last wins),
/// and syncs each parent directory once. Atomicity is per file, not per batch.
pub fn write_json_batch(entries: impl IntoIterator<Item = JsonWrite>) -> Result<(), CaptureError> {
    let mut destinations: HashMap<PathBuf, usize> = HashMap::new();
    let mut unique: Vec<(PathBuf, Vec<u8>)> = Vec::new();
    for entry in entries {
        let path: PathBuf = entry.path.components().collect();
        if let Some(index) = destinations.get(&path).copied() {
            unique[index] = (path, entry.bytes);
        } else {
            destinations.insert(path.clone(), unique.len());
            unique.push((path, entry.bytes));
        }
    }
    let parents: BTreeSet<_> = unique
        .iter()
        .filter_map(|(path, _)| {
            path.parent()
                .filter(|parent| !parent.as_os_str().is_empty())
        })
        .collect();
    for parent in parents {
        std::fs::create_dir_all(parent).map_err(|error| CaptureError::storage(parent, error))?;
    }
    super::atomic_file::write_atomic_batch(
        unique
            .iter()
            .map(|(path, bytes)| (path.as_path(), bytes.as_slice())),
    )
}

/// Applies a batch of edits with a single read, serialization and durable write.
pub fn update_json_batch<T: DeserializeOwned + Serialize>(
    path: &Path,
    updates: impl IntoIterator<Item = impl FnOnce(&mut T) -> Result<(), CaptureError>>,
) -> Result<T, CaptureError> {
    let mut value = read_json(path)?;
    let mut changed = false;
    for update in updates {
        update(&mut value)?;
        changed = true;
    }
    if changed {
        write_json_atomic(path, &value)?;
    }
    Ok(value)
}
