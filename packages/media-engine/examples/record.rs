//! Minimal headless host. Uses native sources; no ARGUI or Electron dependency.
use beam_media_engine::{
    AudioSelection, CameraSelection, ProjectId, RecordingConfig, RecordingController,
};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let root = std::env::args_os()
        .nth(1)
        .ok_or("usage: record <projects-root>")?;
    let engine = RecordingController::new(root)?;
    let sources = engine.list_sources();
    println!("{sources:#?}");
    let screen = if cfg!(target_os = "linux") {
        beam_media_engine::ScreenSelection::Portal {
            kind: beam_media_engine::PortalSourceKind::Monitor,
            restore_token: None,
        }
    } else {
        let source = sources
            .screens?
            .into_iter()
            .find(|source| source.kind == beam_screen::model::SourceKind::Display)
            .ok_or("no screen is available")?;
        beam_media_engine::ScreenSelection::Source {
            source_id: source.id,
        }
    };
    let prepared = engine.prepare(RecordingConfig {
        output: Default::default(),
        screen: Some(beam_media_engine::ScreenRequest {
            selection: screen,
            region: None,
            cursor: beam_media_engine::CursorSelection::Disabled,
            fps: 30,
            excluded_window_handles: Vec::new(),
        }),
        project_id: ProjectId::new(),
        camera: CameraSelection::FirstAvailable {
            width: 640,
            height: 480,
            fps: 30,
        },
        microphone: AudioSelection::Default,
        system_audio: AudioSelection::Default,
    })?;
    let id = prepared.session_id.ok_or("prepare returned no session")?;
    println!("Prepared: {prepared:#?}");
    engine.start(id)?;
    std::thread::sleep(std::time::Duration::from_secs(5));
    let result = engine.stop(id)?;
    println!("Final recording: {result:#?}");
    if result.state != beam_media_engine::RecordingState::Completed {
        return Err("recording did not complete; inspect the track errors above".into());
    }
    Ok(())
}
