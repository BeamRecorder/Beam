use beam_editor_domain::collections::ItemMut;
use beam_editor_engine::{Clip, Project, Track};
use std::sync::Arc;

pub(crate) fn clip(project: &Project, index: usize) -> Arc<Clip> {
    project.clips.try_page(index, 1).unwrap().pop().unwrap()
}
pub(crate) fn clip_mut(project: &mut Project, index: usize) -> ItemMut<'_, Clip> {
    let id = project.clips.headers().nth(index).unwrap().id;
    project.clips.try_by_id_mut(id).unwrap().unwrap()
}
pub(crate) fn track_mut(project: &mut Project, index: usize) -> ItemMut<'_, Track> {
    let id = project.tracks.headers().nth(index).unwrap().id;
    project.tracks.try_by_id_mut(id).unwrap().unwrap()
}
