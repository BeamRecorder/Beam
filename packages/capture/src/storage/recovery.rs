use crate::model::SessionManifest;

use super::{SessionLayout, read_json};

#[derive(Debug, Clone)]
pub struct RecoveryReport {
    pub manifest: SessionManifest,
    pub ignored_trailing_jsonl_lines: usize,
}

pub fn recover_session(layout: &SessionLayout) -> Result<RecoveryReport, crate::CaptureError> {
    let path = if layout.manifest().exists() {
        layout.manifest()
    } else {
        layout.partial_manifest()
    };
    if !path.exists() {
        return Err(crate::CaptureError::SourceNotFound(
            path.display().to_string(),
        ));
    }
    let mut manifest: SessionManifest = read_json(&path)?;
    manifest.completed = layout.manifest().exists();
    if !manifest.completed {
        for track in &mut manifest.tracks {
            let missing_or_incomplete = track
                .segments
                .iter()
                .any(|segment| !segment.complete || !layout.root().join(&segment.path).is_file());
            if missing_or_incomplete
                && matches!(
                    track.status,
                    crate::model::TrackStatus::Preparing
                        | crate::model::TrackStatus::Recording
                        | crate::model::TrackStatus::Paused
                )
            {
                track.status = crate::model::TrackStatus::Interrupted;
                track.termination_reason =
                    Some("recording stopped before every declared segment was finalized".into());
            }
        }
    }
    let cursor_directory = layout.track_dir(crate::model::TrackKind::Cursor);
    let jsonl_paths = [
        layout.health(),
        layout.timing(),
        cursor_directory.join("cursor.partial.jsonl"),
        cursor_directory.join("input.partial.jsonl"),
    ];
    let ignored = jsonl_paths.iter().try_fold(0_usize, |total, path| {
        repair_invalid_trailing_lines(path).map(|ignored| total.saturating_add(ignored))
    })?;
    Ok(RecoveryReport {
        manifest,
        ignored_trailing_jsonl_lines: ignored,
    })
}

fn repair_invalid_trailing_lines(path: &std::path::Path) -> Result<usize, crate::CaptureError> {
    if !path.exists() {
        return Ok(0);
    }
    let file =
        std::fs::File::open(path).map_err(|error| crate::CaptureError::storage(path, error))?;
    let mut reader = std::io::BufReader::new(file);
    let mut bytes = Vec::new();
    let mut valid_end = 0_u64;
    let mut ignored = 0_usize;
    loop {
        let count = super::read_record(&mut reader, &mut bytes, path)?;
        if count == 0 {
            break;
        }
        let blank = bytes.iter().all(u8::is_ascii_whitespace);
        let valid = blank || serde_json::from_slice::<serde_json::Value>(&bytes).is_ok();
        if valid && ignored > 0 && !blank {
            return Err(crate::CaptureError::storage(
                path,
                std::io::Error::new(
                    std::io::ErrorKind::InvalidData,
                    "capture journal has corruption before a valid record; original data was preserved",
                ),
            ));
        }
        if valid && ignored == 0 {
            valid_end += count as u64;
        } else {
            ignored += 1;
        }
    }
    drop(reader);
    if ignored > 0 {
        let file = std::fs::OpenOptions::new()
            .write(true)
            .open(path)
            .map_err(|error| crate::CaptureError::storage(path, error))?;
        file.set_len(valid_end)
            .and_then(|()| file.sync_all())
            .map_err(|error| crate::CaptureError::storage(path, error))?;
    }
    Ok(ignored)
}

#[cfg(test)]
#[path = "recovery_tests.rs"]
mod tests;
