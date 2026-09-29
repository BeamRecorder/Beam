//! Real stream discovery and immutable, project-owned media imports.
use super::types::Probe;
use crate::{EditorError, MediaAsset, Result};
use std::{fs, path::Path};
use uuid::Uuid;

/// Converts a local media path into an escaped URI understood by GStreamer.
pub fn uri(path: &Path) -> Result<String> {
    let path = path
        .canonicalize()
        .map_err(|e| crate::shared::storage(path, e))?;
    gst::glib::filename_to_uri(path, None)
        .map(|u| u.to_string())
        .map_err(|e| EditorError::Media(e.to_string()))
}
/// Discovers actual streams and duration; incomplete or unsupported media fails explicitly.
pub fn discover(path: &Path) -> Result<Probe> {
    gst::init().map_err(|e| EditorError::Media(e.to_string()))?;
    let discoverer = gst_pbutils::Discoverer::new(gst::ClockTime::from_seconds(10))
        .map_err(|e| EditorError::Media(e.to_string()))?;
    let info = discoverer
        .discover_uri(&uri(path)?)
        .map_err(|e| EditorError::Media(e.to_string()))?;
    if info.result() != gst_pbutils::DiscovererResult::Ok {
        return Err(EditorError::Media(format!(
            "media discovery failed: {:?}",
            info.result()
        )));
    }
    let video = info.video_streams();
    let audio = info.audio_streams();
    let is_image = video.first().is_some_and(|video| video.is_image());
    let duration = if is_image {
        5000
    } else {
        info.duration()
            .ok_or_else(|| EditorError::Media("media has no finite duration".into()))?
            .mseconds()
    };
    if duration == 0
        || duration > crate::project::types::MAX_DURATION_MS
        || (video.is_empty() && audio.is_empty())
    {
        return Err(EditorError::Invalid(
            "import requires finite video or audio of at most six hours".into(),
        ));
    }
    Ok(Probe {
        duration_ms: duration,
        width: video.first().map_or(0, |v| v.width()),
        height: video.first().map_or(0, |v| v.height()),
        has_video: !video.is_empty(),
        has_audio: !audio.is_empty(),
        is_image,
    })
}
/// Copies a selected source into the project's media directory without touching the original.
/// An interrupted copy never becomes a referenced asset.
pub fn import(root: &Path, path: &Path) -> Result<MediaAsset> {
    let metadata = discover(path)?;
    let id = Uuid::new_v4();
    let directory = root.join("media");
    fs::create_dir_all(&directory).map_err(|e| crate::shared::storage(&directory, e))?;
    let extension = path
        .extension()
        .and_then(|e| e.to_str())
        .filter(|e| !e.is_empty() && e.len() <= 12 && e.chars().all(|c| c.is_ascii_alphanumeric()))
        .ok_or_else(|| EditorError::Invalid("media filename needs an extension".into()))?;
    let relative = format!("media/{id}.{extension}");
    let destination = root.join(&relative);
    let temporary = tempfile::NamedTempFile::new_in(&directory)
        .map_err(|e| crate::shared::storage(&directory, e))?;
    fs::copy(path, temporary.path()).map_err(|e| crate::shared::storage(path, e))?;
    temporary
        .as_file()
        .sync_all()
        .map_err(|e| crate::shared::storage(temporary.path(), e))?;
    temporary
        .persist_noclobber(&destination)
        .map_err(|e| crate::shared::storage(&destination, e.error))?;
    Ok(MediaAsset {
        id,
        name: path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("Media")
            .to_owned(),
        path: relative,
        duration_ms: metadata.duration_ms,
        width: metadata.width,
        height: metadata.height,
        has_video: metadata.has_video,
        has_audio: metadata.has_audio,
        is_image: metadata.is_image,
        cursor: vec![],
        zooms: vec![],
        recording: false,
    })
}
