use super::InputEvent;
use crate::{
    CaptureError,
    storage::{JsonlReader, StagedFile},
};
use std::{io::Write, path::Path};

const SORT_CHUNK_EVENTS: usize = 4096;

/// Stable external merge sort: at most 4096 events and two input records are
/// resident. Binary runs also bound open descriptors and run metadata to 64.
pub(super) fn sorted_events(partial: &Path) -> Result<StagedFile, CaptureError> {
    let mut reader = JsonlReader::<InputEvent>::open(partial)?;
    let mut runs: Vec<Option<StagedFile>> = Vec::new();
    loop {
        let mut events = Vec::with_capacity(SORT_CHUNK_EVENTS);
        let mut bytes = 0;
        while events.len() < SORT_CHUNK_EVENTS && bytes < 1024 * 1024 {
            let Some(event) = reader.next_record()? else {
                break;
            };
            bytes += reader.last_record_bytes();
            events.push(event);
        }
        if events.is_empty() {
            break;
        }
        events.sort_by_key(InputEvent::session_ns);
        let mut run = StagedFile::new(partial)?;
        for event in events {
            write_event(&mut run, &event)?;
        }
        run.seal()?;
        let mut level = 0;
        loop {
            if level == runs.len() {
                runs.push(None);
            }
            if let Some(older) = runs[level].take() {
                run = merge(partial, older, run)?;
                level += 1;
            } else {
                runs[level] = Some(run);
                break;
            }
        }
    }
    let mut result = None;
    // Larger runs precede smaller runs in the original journal.
    for run in runs.into_iter().rev().flatten() {
        result = Some(match result {
            Some(older) => merge(partial, older, run)?,
            None => run,
        });
    }
    if let Some(result) = result {
        return Ok(result);
    }
    let mut empty = StagedFile::new(partial)?;
    empty.seal()?;
    Ok(empty)
}

fn write_event(file: &mut StagedFile, event: &InputEvent) -> Result<(), CaptureError> {
    serde_json::to_writer(file.writer()?, event)?;
    file.writer()?
        .write_all(b"\n")
        .map_err(|error| CaptureError::storage(file.path(), error))
}

fn merge(path: &Path, older: StagedFile, newer: StagedFile) -> Result<StagedFile, CaptureError> {
    let mut left = JsonlReader::<InputEvent>::open(older.path())?;
    let mut right = JsonlReader::<InputEvent>::open(newer.path())?;
    let mut a = left.next_record()?;
    let mut b = right.next_record()?;
    let mut output = StagedFile::new(path)?;
    while a.is_some() || b.is_some() {
        let take_left = match (&a, &b) {
            (Some(a), Some(b)) => a.session_ns() <= b.session_ns(),
            (Some(_), None) => true,
            _ => false,
        };
        let event = if take_left { a.take() } else { b.take() };
        if let Some(event) = event {
            write_event(&mut output, &event)?;
        }
        if take_left {
            a = left.next_record()?;
        } else {
            b = right.next_record()?;
        }
    }
    output.seal()?;
    Ok(output)
}
