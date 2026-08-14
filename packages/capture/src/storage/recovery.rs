use crate::model::SessionManifest;

use super::SessionLayout;

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
    let mut manifest: SessionManifest = serde_json::from_slice(
        &std::fs::read(&path).map_err(|e| crate::CaptureError::storage(&path, e))?,
    )?;
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
        cursor_directory.join("cursor.json"),
        cursor_directory.join("cursor.partial.jsonl"),
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
    let contents =
        std::fs::read_to_string(path).map_err(|error| crate::CaptureError::storage(path, error))?;
    let lines = contents.lines().collect::<Vec<_>>();
    let valid_count = lines
        .iter()
        .position(|line| serde_json::from_str::<serde_json::Value>(line).is_err())
        .unwrap_or(lines.len());
    let ignored = lines.len().saturating_sub(valid_count);
    if ignored > 0 {
        let mut repaired = lines[..valid_count].join("\n");
        if !repaired.is_empty() {
            repaired.push('\n');
        }
        std::fs::write(path, repaired)
            .map_err(|error| crate::CaptureError::storage(path, error))?;
    }
    Ok(ignored)
}
