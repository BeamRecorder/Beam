use crate::fixtures::decision_mut;
mod camera;
mod cursor;
use beam_editor_domain::recording::style_types::{CursorMode, CursorShape};
use beam_editor_engine::{Project, video::probe};

pub fn project(root: &std::path::Path, media: &std::path::Path) -> Project {
    let mut project = super::effects::project();
    let path = super::transitions::fixture(media, "recording.webm", "black", 440);
    let mut asset = probe::import(root, &path).unwrap();
    asset.has_audio = false;
    asset.recording = true;
    asset.cursor_mode = CursorMode::Separated;
    asset.cursor = vec![
        crate::fixtures::point(0, 0.75, 0.5, None),
        crate::fixtures::point(2900, 0.75, 0.5, None),
    ]
    .into();
    decision_mut(&mut project.clips, 0).generator = None;
    decision_mut(&mut project.clips, 0).asset_id = asset.id;
    decision_mut(&mut project.clips, 0).duration_ms = 3000;
    decision_mut(&mut project.clips, 0).effects.auto_zoom = false;
    project.recording_style.cursor.shape = CursorShape::Dot;
    project.recording_style.cursor.size = 8.;
    project.recording_style.cursor.smoothing_ms = 0;
    project.recording_style.cursor.hide_after_ms = 0;
    project.assets = vec![asset];
    project
}
pub fn pixel(frame: &beam_editor_engine::PreviewFrame, x: u32, y: u32) -> [u8; 4] {
    let index = ((y * frame.width + x) * 4) as usize;
    frame.rgba[index..index + 4].try_into().unwrap()
}
