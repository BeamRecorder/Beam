//! Validation memo keys include every mutable dependency, with immutable telemetry digests.
use crate::{Project, Result};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex, OnceLock, Weak},
};

type TelemetryCache<T> = Mutex<HashMap<usize, (Weak<Vec<T>>, String)>>;
static CURSORS: OnceLock<TelemetryCache<crate::recording::types::CursorPoint>> = OnceLock::new();
static ZOOMS: OnceLock<TelemetryCache<crate::recording::types::Zoom>> = OnceLock::new();

pub(super) fn key(project: &Project) -> Result<String> {
    let mut digest = Sha256::new();
    digest.update(serde_json::to_vec(&(
        &project.id,
        &project.name,
        &project.canvas,
        &project.recording_style,
        &project.definitions,
        &project.presets,
        &project.extension_packs,
        &project.transitions,
        &project.sequence_instances,
    ))?);
    for track in project.tracks.headers() {
        digest.update(serde_json::to_vec(track)?);
    }
    for asset in &project.assets {
        digest.update(serde_json::to_vec(&(
            &asset.id,
            &asset.name,
            &asset.path,
            &asset.identity,
            asset.duration_ms,
            asset.width,
            asset.height,
            asset.has_video,
            asset.has_audio,
            asset.is_image,
            asset.recording,
            asset.cursor_mode,
        ))?);
        digest.update(telemetry(
            &asset.cursor,
            CURSORS.get_or_init(Default::default),
        )?);
        digest.update(telemetry(
            &asset.zooms,
            ZOOMS.get_or_init(Default::default),
        )?);
    }
    Ok(format!("{:x}", digest.finalize()))
}
fn telemetry<T: Serialize>(data: &Arc<Vec<T>>, cache: &TelemetryCache<T>) -> Result<String> {
    let pointer = Arc::as_ptr(data) as usize;
    let mut entries = cache.lock().map_err(|_| crate::EditorError::Stopped)?;
    if let Some((weak, digest)) = entries.get(&pointer)
        && weak
            .upgrade()
            .is_some_and(|value| Arc::ptr_eq(&value, data))
    {
        return Ok(digest.clone());
    }
    let digest = format!("{:x}", Sha256::digest(serde_json::to_vec(data)?));
    if entries.len() >= 256 {
        entries.clear();
    }
    // A weak reference also makes Arc::make_mut detach before a safe mutation.
    entries.insert(pointer, (Arc::downgrade(data), digest.clone()));
    Ok(digest)
}
