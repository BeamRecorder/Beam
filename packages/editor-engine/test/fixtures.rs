use beam_editor_engine::video::zoom::types::{CursorInteractionType, CursorPoint};
use beam_editor_engine::{Clip, Effects, MediaAsset, Project};
use gst::prelude::*;
use std::{
    path::{Path, PathBuf},
    time::{Duration, Instant},
};
use uuid::Uuid;

pub fn asset(duration_ms: u64) -> MediaAsset {
    MediaAsset {
        is_image: false,
        id: Uuid::new_v4(),
        name: "Source".into(),
        path: "media/source.webm".into(),
        identity: None,
        duration_ms,
        width: 320,
        height: 180,
        has_video: true,
        has_audio: false,
        cursor: vec![].into(),
        zooms: vec![].into(),
        recording: false,
        cursor_mode: Default::default(),
    }
}
pub fn project() -> Project {
    let mut project = Project::new("Test".into());
    let asset = asset(10_000);
    project
        .clips
        .try_push(Clip {
            cursor_style: None,
            title: None,
            instances: vec![],
            rate: Default::default(),
            animation_offset_ms: 0,
            generator: None,
            link_group: None,
            id: Uuid::new_v4(),
            asset_id: asset.id,
            track_id: project.tracks.headers().next().unwrap().id,
            start_ms: 0,
            source_in_ms: 0,
            duration_ms: 10_000,
            effects: Effects::default(),
        })
        .unwrap();
    project.assets.push(asset);
    project
}
pub fn clip(project: &Project, index: usize) -> std::sync::Arc<Clip> {
    decision(&project.clips, index)
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
        cursor_type: None,
        visible: None,
        time_ms,
        cx,
        cy,
        interaction_type,
    }
}
pub fn media(directory: &Path, name: &str, audio: bool) -> PathBuf {
    gst::init().unwrap();
    let path = directory.join(name);
    let audio = if audio {
        "audiotestsrc num-buffers=47 samplesperbuffer=1024 ! audioconvert ! vorbisenc ! mux. "
    } else {
        ""
    };
    let pipeline = gst::parse::launch(&format!("webmmux name=mux ! filesink location=\"{}\" videotestsrc num-buffers=30 pattern=ball ! video/x-raw,width=320,height=180,framerate=30/1 ! vp8enc deadline=1 ! mux. {audio}", path.display()))
        .unwrap().downcast::<gst::Pipeline>().unwrap();
    pipeline.set_state(gst::State::Playing).unwrap();
    let message = pipeline
        .bus()
        .unwrap()
        .timed_pop_filtered(
            gst::ClockTime::from_seconds(10),
            &[gst::MessageType::Eos, gst::MessageType::Error],
        )
        .unwrap();
    pipeline.set_state(gst::State::Null).unwrap();
    assert!(
        matches!(message.view(), gst::MessageView::Eos(..)),
        "{message:?}"
    );
    path
}
pub fn wait_export(
    controller: &beam_editor_engine::EditorController,
) -> beam_editor_engine::export::types::ExportStatus {
    let deadline = Instant::now() + Duration::from_secs(30);
    loop {
        let status = controller.export_status();
        if status.phase != beam_editor_engine::export::types::ExportPhase::Rendering {
            return status;
        }
        assert!(Instant::now() < deadline, "export exceeded test deadline");
        std::thread::sleep(Duration::from_millis(20));
    }
}
pub fn context<T>(operation: impl FnOnce() -> T) -> T {
    gst::glib::MainContext::new()
        .with_thread_default(operation)
        .unwrap()
}
