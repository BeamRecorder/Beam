use std::path::Path;
#[cfg(test)]
use std::path::PathBuf;

use crate::{
    CaptureError,
    cursor::{CursorEvent, CursorShapeCatalogEntry},
    input::finalize_input_events,
    storage::{JsonlReader, StagedFile},
};

#[cfg(test)]
pub(crate) struct CursorRecordingPaths {
    pub partial: PathBuf,
    pub final_path: PathBuf,
    pub telemetry: PathBuf,
    pub shapes: PathBuf,
    pub input_partial: PathBuf,
    pub input: PathBuf,
}

#[cfg(test)]
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

#[cfg(any(windows, target_os = "macos", test))]
pub(crate) fn finalize_session_cursor(directory: &Path) -> Result<(), CaptureError> {
    #[cfg(any(windows, target_os = "macos"))]
    if super::cursor_worker_active() {
        return Err(CaptureError::Backend(
            "cursor worker is still active; interaction journals were preserved".into(),
        ));
    }
    let partial = directory.join("cursor.partial.jsonl");
    let input_partial = directory.join("input.partial.jsonl");
    let mut failure = None;
    if partial.exists() {
        failure = finalize_cursor_artifacts(
            &partial,
            &directory.join("cursor.json"),
            &directory.join("telemetry.json"),
            &directory.join("shapes.json"),
        )
        .err();
    }
    if input_partial.exists()
        && let Err(error) = finalize_input_events(&input_partial, &directory.join("input.json"))
    {
        failure.get_or_insert(error);
    }
    failure.map_or(Ok(()), Err)
}

fn finalize_cursor_artifacts(
    partial: &Path,
    destination: &Path,
    telemetry_path: &Path,
    shapes_path: &Path,
) -> Result<(), CaptureError> {
    use std::io::Write;
    let mut reader = JsonlReader::<CursorEvent>::open(partial)?;
    let mut events = StagedFile::new(destination)?;
    events
        .writer()?
        .write_all(b"[")
        .map_err(|error| CaptureError::storage(destination, error))?;
    let mut telemetry = super::telemetry::TelemetryBuilder::default();
    let mut shapes = std::collections::BTreeMap::<String, CursorShapeCatalogEntry>::new();
    let mut shape_bytes = 0;
    let mut first = true;
    while let Some(event) = reader.next_record()? {
        if !first {
            events
                .writer()?
                .write_all(b",")
                .map_err(|error| CaptureError::storage(destination, error))?;
        }
        first = false;
        serde_json::to_writer(events.writer()?, &event)?;
        telemetry.push(&event);
        if let CursorEvent::Shape {
            cursor_id,
            cursor_kind,
            native_cursor_id,
            hotspot,
            ..
        } = event
        {
            if !shapes.contains_key(&cursor_id) && shapes.len() >= 4096 {
                return Err(CaptureError::Backend(
                    "cursor shape catalogue exceeds 4096 identities; journal was preserved".into(),
                ));
            }
            let previous_bytes = shapes
                .get(&cursor_id)
                .map_or(0, |entry| cursor_id.len() + entry.native_cursor_id.len());
            shape_bytes = shape_bytes - previous_bytes + cursor_id.len() + native_cursor_id.len();
            if shape_bytes > 8 * 1024 * 1024 {
                return Err(CaptureError::Backend(
                    "cursor shape catalogue exceeds 8 MiB; journal was preserved".into(),
                ));
            }
            shapes.insert(
                cursor_id,
                CursorShapeCatalogEntry {
                    cursor_kind,
                    native_cursor_id,
                    hotspot,
                },
            );
        }
    }
    events
        .writer()?
        .write_all(b"]")
        .map_err(|error| CaptureError::storage(destination, error))?;
    let mut telemetry_file = StagedFile::new(telemetry_path)?;
    serde_json::to_writer(telemetry_file.writer()?, &telemetry.finish())?;
    let mut shapes_file = StagedFile::new(shapes_path)?;
    serde_json::to_writer(shapes_file.writer()?, &shapes)?;
    // Stage every cursor artifact before replacing any destination. On a
    // publication error retain the journal so retry is idempotent.
    events.seal()?;
    telemetry_file.seal()?;
    shapes_file.seal()?;
    events.publish()?;
    telemetry_file.publish()?;
    shapes_file.publish()?;
    remove_published_partial(partial)
}

fn remove_published_partial(path: &Path) -> Result<(), CaptureError> {
    std::fs::remove_file(path).map_err(|error| CaptureError::storage(path, error))
}

#[cfg(test)]
#[path = "recording_stress_tests.rs"]
mod stress_tests;
#[cfg(test)]
#[path = "recording_support_tests.rs"]
mod tests;
