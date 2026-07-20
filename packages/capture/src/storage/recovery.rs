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
    let ignored = count_invalid_trailing_lines(&layout.health())?
        + count_invalid_trailing_lines(&layout.timing())?;
    Ok(RecoveryReport {
        manifest,
        ignored_trailing_jsonl_lines: ignored,
    })
}

fn count_invalid_trailing_lines(path: &std::path::Path) -> Result<usize, crate::CaptureError> {
    if !path.exists() {
        return Ok(0);
    }
    let contents =
        std::fs::read_to_string(path).map_err(|e| crate::CaptureError::storage(path, e))?;
    Ok(contents
        .lines()
        .rev()
        .take_while(|line| serde_json::from_str::<serde_json::Value>(line).is_err())
        .count())
}
