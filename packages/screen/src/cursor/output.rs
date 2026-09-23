use super::{
    CursorEvent, CursorEventWriter, CursorShapeCatalogEntry, Hotspot,
    buttons::{RecordedButton, materialize_buttons},
    fusion::{CursorAnchor, CursorFusion, CursorInputEvent, FusedCursorEvent},
    telemetry_from_events,
};
use crate::{CaptureError, screen::CursorSampleState, storage::write_atomic};
use std::{collections::BTreeMap, path::PathBuf};
pub struct CursorOutput {
    directory: PathBuf,
    partial_writer: Option<CursorEventWriter>,
    events: Vec<CursorEvent>,
    shapes: BTreeMap<String, CursorShapeCatalogEntry>,
    previous_id: Option<String>,
    previous_visibility: Option<bool>,
    fusion: CursorFusion,
    buttons: Vec<RecordedButton>,
    input_count: usize,
}

impl CursorOutput {
    pub fn finish(&mut self) -> Result<(), CaptureError> {
        let cursor = self;
        cursor.finish_fusion()?;
        cursor.materialize_buttons();
        std::fs::create_dir_all(&cursor.directory)
            .map_err(|error| CaptureError::storage(&cursor.directory, error))?;
        if let Some(writer) = cursor.partial_writer.as_mut() {
            writer.flush()?;
        }
        let events_path = cursor.directory.join("cursor.json");
        let telemetry_path = cursor.directory.join("telemetry.json");
        let shapes_path = cursor.directory.join("shapes.json");
        write_atomic(&events_path, &serde_json::to_vec_pretty(&cursor.events)?)?;
        write_atomic(
            &telemetry_path,
            &serde_json::to_vec_pretty(&telemetry_from_events(&cursor.events))?,
        )?;
        write_atomic(&shapes_path, &serde_json::to_vec_pretty(&cursor.shapes)?)?;
        cursor.partial_writer = None;
        let partial = cursor.directory.join("cursor.partial.jsonl");
        if partial.exists() {
            std::fs::remove_file(&partial)
                .map_err(|error| CaptureError::storage(&partial, error))?;
        }
        Ok(())
    }

    pub fn new(directory: PathBuf) -> Self {
        Self {
            directory,
            partial_writer: None,
            events: Vec::new(),
            shapes: BTreeMap::new(),
            previous_id: None,
            previous_visibility: None,
            fusion: CursorFusion::default(),
            buttons: Vec::new(),
            input_count: 0,
        }
    }

    pub fn push_sample(
        &mut self,
        session_ns: u64,
        sample: CursorSampleState,
    ) -> Result<(), CaptureError> {
        let CursorSampleState::Known {
            native_cursor_id,
            cursor_kind,
            pixel_x,
            pixel_y,
            normalized_x,
            normalized_y,
            visible,
            hotspot,
        } = sample
        else {
            return Ok(());
        };
        let fused = self.fusion.reconcile(CursorAnchor {
            session_ns,
            pixel_x,
            pixel_y,
            normalized_x,
            normalized_y,
        });
        self.push_fused(fused)?;
        if self.previous_id.as_deref() != Some(&native_cursor_id) {
            let hotspot = hotspot.unwrap_or(Hotspot { x: 0, y: 0 });
            self.push(CursorEvent::Shape {
                session_ns,
                cursor_id: native_cursor_id.clone(),
                cursor_kind,
                native_cursor_id: native_cursor_id.clone(),
                hotspot,
            })?;
            self.shapes.insert(
                native_cursor_id.clone(),
                CursorShapeCatalogEntry {
                    cursor_kind,
                    native_cursor_id: native_cursor_id.clone(),
                    hotspot,
                },
            );
            self.previous_id = Some(native_cursor_id.clone());
        }
        if self.previous_visibility != Some(visible) {
            self.push(CursorEvent::Visibility {
                session_ns,
                visible,
            })?;
            self.previous_visibility = Some(visible);
        }
        self.push(CursorEvent::Move {
            session_ns,
            cursor_id: Some(native_cursor_id),
            pixel_x,
            pixel_y,
            normalized_x,
            normalized_y,
            visible,
        })?;
        Ok(())
    }

    pub(crate) fn push_input(&mut self, event: CursorInputEvent) -> Result<(), CaptureError> {
        if self.input_count >= 1_000_000 {
            return Err(CaptureError::Backend(
                "cursor input event limit reached".into(),
            ));
        }
        self.input_count += 1;
        self.fusion.push(event);
        Ok(())
    }

    pub(crate) fn push_button(&mut self, button: RecordedButton) -> Result<(), CaptureError> {
        if self.buttons.len() >= 1_000_000 {
            return Err(CaptureError::Backend(
                "cursor button event limit reached".into(),
            ));
        }
        self.buttons.push(button);
        Ok(())
    }

    fn materialize_buttons(&mut self) {
        materialize_buttons(&mut self.events, std::mem::take(&mut self.buttons));
    }

    fn finish_fusion(&mut self) -> Result<(), CaptureError> {
        let events = self.fusion.finish();
        self.push_fused(events)
    }

    fn push_fused(&mut self, events: Vec<FusedCursorEvent>) -> Result<(), CaptureError> {
        let cursor_id = self.previous_id.clone();
        let visible = self.previous_visibility.unwrap_or(true);
        for event in events {
            self.push(CursorEvent::Move {
                session_ns: event.session_ns,
                cursor_id: cursor_id.clone(),
                pixel_x: event.pixel_x,
                pixel_y: event.pixel_y,
                normalized_x: event.normalized_x,
                normalized_y: event.normalized_y,
                visible,
            })?;
        }
        Ok(())
    }

    fn push(&mut self, event: CursorEvent) -> Result<(), CaptureError> {
        if self.partial_writer.is_none() {
            std::fs::create_dir_all(&self.directory)
                .map_err(|error| CaptureError::storage(&self.directory, error))?;
            self.partial_writer = Some(CursorEventWriter::open(
                &self.directory.join("cursor.partial.jsonl"),
            )?);
        }
        self.partial_writer
            .as_mut()
            .ok_or_else(|| CaptureError::Backend("cursor writer was not initialized".into()))?
            .push(event.clone())?;
        if self.events.len() >= 1_000_000 {
            return Err(CaptureError::Backend("cursor event budget exceeded".into()));
        }
        self.events.push(event);
        Ok(())
    }
}

#[path = "../../test/cursor/output.rs"]
mod output_checks;
