use beam_editor_domain::recording::types::{CursorInteractionType, CursorPoint};
use beam_editor_domain::{Clip, Effects, MediaAsset, Project};
use uuid::Uuid;
pub fn asset(duration_ms: u64) -> MediaAsset {
    MediaAsset {
        id: Uuid::new_v4(),
        name: "Source".into(),
        path: "media/source.webm".into(),
        identity: None,
        duration_ms,
        width: 320,
        height: 180,
        has_video: true,
        has_audio: false,
        is_image: false,
        cursor: vec![].into(),
        zooms: vec![].into(),
        recording: false,
        cursor_mode: Default::default(),
    }
}
pub fn project() -> Project {
    let mut p = Project::new("Test".into());
    let a = asset(10_000);
    p.clips
        .try_push(Clip {
            id: Uuid::new_v4(),
            asset_id: a.id,
            track_id: p.tracks.headers().next().unwrap().id,
            start_ms: 0,
            source_in_ms: 0,
            duration_ms: 10_000,
            effects: Effects::default(),
            cursor_style: None,
            title: None,
            instances: vec![],
            rate: Default::default(),
            animation_offset_ms: 0,
            generator: None,
            link_group: None,
        })
        .unwrap();
    p.assets.push(a);
    p
}
pub fn clip(project: &Project, index: usize) -> std::sync::Arc<Clip> {
    decision(&project.clips, index)
}
pub fn source_identity(project: &mut Project, bytes: &[u8]) {
    use sha2::{Digest, Sha256};
    for asset in &mut project.assets {
        asset.identity = Some(beam_editor_domain::project::types::SourceIdentity {
            sha256: format!("{:x}", Sha256::digest(bytes)),
            byte_length: bytes.len() as u64,
        });
    }
}
pub fn clip_mut(
    project: &mut Project,
    index: usize,
) -> beam_editor_domain::collections::ItemMut<'_, Clip> {
    decision_mut(&mut project.clips, index)
}
pub fn decision(
    clips: &beam_editor_domain::collections::PersistentCollection<Clip>,
    index: usize,
) -> std::sync::Arc<Clip> {
    clips
        .try_by_id(clips.headers().nth(index).unwrap().id)
        .unwrap()
        .unwrap()
}
pub fn decision_mut(
    clips: &mut beam_editor_domain::collections::PersistentCollection<Clip>,
    index: usize,
) -> beam_editor_domain::collections::ItemMut<'_, Clip> {
    let id = clips.headers().nth(index).unwrap().id;
    clips.try_by_id_mut(id).unwrap().unwrap()
}
pub fn point(
    time_ms: u64,
    cx: f64,
    cy: f64,
    interaction_type: Option<CursorInteractionType>,
) -> CursorPoint {
    CursorPoint {
        time_ms,
        cx,
        cy,
        interaction_type,
    }
}
