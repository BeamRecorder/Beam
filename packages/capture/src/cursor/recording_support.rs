use std::path::{Path, PathBuf};

use crate::{
    CaptureError,
    cursor::{CursorEvent, CursorShapeCatalogEntry, telemetry_from_events},
    input::finalize_input_events,
    storage::write_atomic,
};

pub(crate) struct CursorRecordingPaths {
    pub partial: PathBuf,
    pub final_path: PathBuf,
    pub telemetry: PathBuf,
    pub shapes: PathBuf,
    pub input_partial: PathBuf,
    pub input: PathBuf,
}

pub(crate) fn finalize_after_worker(
    worker_result: Result<(), CaptureError>,
    paths: CursorRecordingPaths,
) -> Result<(), CaptureError> {
    let mut first_error = worker_result.err();
    if let Err(error) = finalize_cursor_artifacts(
        &paths.partial,
        &paths.final_path,
        &paths.telemetry,
        &paths.shapes,
    ) {
        first_error.get_or_insert(error);
    }
    if let Err(error) = finalize_input_events(&paths.input_partial, &paths.input) {
        first_error.get_or_insert(error);
    }
    first_error.map_or(Ok(()), Err)
}

fn finalize_cursor_artifacts(
    partial: &Path,
    destination: &Path,
    telemetry_path: &Path,
    shapes_path: &Path,
) -> Result<(), CaptureError> {
    let contents =
        std::fs::read_to_string(partial).map_err(|error| CaptureError::storage(partial, error))?;
    let events = contents
        .lines()
        .filter(|line| !line.trim().is_empty())
        .map(serde_json::from_str::<CursorEvent>)
        .collect::<Result<Vec<_>, _>>()?;
    write_atomic(destination, &serde_json::to_vec_pretty(&events)?)?;
    write_atomic(
        telemetry_path,
        &serde_json::to_vec_pretty(&telemetry_from_events(&events))?,
    )?;
    let shapes = events
        .into_iter()
        .filter_map(|event| match event {
            CursorEvent::Shape {
                cursor_id,
                cursor_kind,
                native_cursor_id,
                hotspot,
                ..
            } => Some((
                cursor_id,
                CursorShapeCatalogEntry {
                    cursor_kind,
                    native_cursor_id,
                    hotspot,
                },
            )),
            _ => None,
        })
        .collect::<std::collections::BTreeMap<_, _>>();
    write_atomic(shapes_path, &serde_json::to_vec_pretty(&shapes)?)?;
    remove_published_partial(partial)
}

fn remove_published_partial(path: &Path) -> Result<(), CaptureError> {
    std::fs::remove_file(path).map_err(|error| CaptureError::storage(path, error))
}

#[cfg(test)]
#[path = "recording_support_tests.rs"]
mod tests;
