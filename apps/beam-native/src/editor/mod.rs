//! Narrow services for the native NLE. GES and project storage stay in Rust.
mod files;
mod frame;
mod project_types;
mod session;
mod types;
mod video;
mod window;
use crate::{ServiceOutcome, ServiceRegistry, json};
use argui_platform::file_picker::{FileDialog, FilePickerMode};
use argui_render::GpuCanvasRegistration;
use beam_editor_engine::EditorController;
pub(crate) use files::{find_recording, list_projects, project_preview_video};
use std::{path::PathBuf, sync::Arc};
pub(crate) use window::{is_editor, window_config};

/// Registers typed editor operations and native file dialogs before the scene mounts.
pub(crate) fn register(
    registry: &Arc<ServiceRegistry>,
    root: PathBuf,
) -> Result<Vec<GpuCanvasRegistration>, String> {
    beam_editor_engine::video::recording_effects::cursor_catalog::configure_library(
        root.join("media/cursors"),
    )
    .map_err(|e| e.to_string())?;
    registry.register("editor", "cursorPacks", move |_| {
        result(
            beam_editor_engine::video::recording_effects::cursor_catalog::summaries()
                .map_err(|e| e.to_string()),
        )
    });
    let controller = Arc::new(EditorController::new().map_err(|e| e.to_string())?);
    let events = Arc::downgrade(registry);
    controller.set_change_consumer(move|change|{
        if let Some(registry)=events.upgrade(){registry.broadcast_event(&serde_json::json!({"type":"editorChanged","projectId":change.project_id,"sequenceId":change.sequence_id,"revision":change.revision}));}
    });
    let cursor_defaults = beam_editor_engine::project::cursor_preferences::defaults(&root)
        .map_err(|e| e.to_string())?;
    let session = Arc::new(session::Session::new(controller.clone(), cursor_defaults));
    session.configure(std::env::args())?;
    let initial = Arc::clone(&session);
    let initial_root = root.clone();
    registry.register("editor", "bootstrap", move |_| {
        result((|| {
            if let Some(path) = std::env::args()
                .find_map(|a| a.strip_prefix("--editor-project=").map(PathBuf::from))
            {
                return initial.open(path).map_err(|e| e.to_string());
            }
            if let Some(id) =
                std::env::args().find_map(|a| a.strip_prefix("--editor=").map(str::to_owned))
            {
                let project = files::find_recording(&initial_root, &id)?;
                initial.open(project).map_err(|e| e.to_string())
            } else {
                files::create(&initial, &initial_root)
            }
        })())
    });
    let new = Arc::clone(&session);
    registry.register("editor", "new", move |_| result(files::create(&new, &root)));
    let open = Arc::clone(&session);
    registry.register("editor", "open", move |_| {
        dialog(
            FileDialog::new(FilePickerMode::File).title("Open Beam project"),
            |paths| {
                let path = paths.first().ok_or("choose a Beam project")?;
                if !matches!(
                    path.file_name().and_then(|v| v.to_str()),
                    Some("editor.beam.json" | "project.json")
                ) {
                    return Err("choose editor.beam.json or project.json".into());
                }
                open.open(path.parent().ok_or("project has no directory")?.to_owned())
                    .map_err(|e| e.to_string())
            },
        )
    });
    let import = Arc::clone(&session);
    registry.register("editor", "import", move |_| {
        dialog(
            FileDialog::new(FilePickerMode::Files).title("Import media"),
            |paths| import.import(paths).map_err(|e| e.to_string()),
        )
    });
    let edit = Arc::clone(&session);
    registry.register("editor", "edit", move |payload| {
        result((|| {
            let request: types::EditRequest = json::decode(payload)?;
            let document = edit.controller.document().map_err(|e| e.to_string())?;
            let mut transaction =
                beam_editor_engine::domain::commands::single(&document, request.edit);
            transaction.expected_revision = request.revision;
            edit.service
                .request(beam_editor_engine::domain::protocol::Request::Transaction { transaction })
                .map_err(|e| e.to_string())?;
            edit.controller.snapshot().map_err(|e| e.to_string())
        })())
    });
    let commands = Arc::clone(&session);
    registry.register("editor", "commands", move |payload| {
        result((|| {
            let request: types::CommandsRequest = json::decode(payload)?;
            let document = commands.controller.document().map_err(|e| e.to_string())?;
            let transaction = beam_editor_engine::domain::commands::types::Transaction {
                api_version: 1,
                project_id: document.project.id,
                sequence_id: request.sequence_id,
                expected_revision: request.revision,
                idempotency_key: uuid::Uuid::new_v4().to_string(),
                commands: request.commands,
            };
            commands
                .service
                .request(beam_editor_engine::domain::protocol::Request::Transaction { transaction })
                .map_err(|e| e.to_string())?;
            commands.controller.snapshot().map_err(|e| e.to_string())
        })())
    });
    let snapshot = Arc::clone(&controller);
    let queries = Arc::clone(&session);
    registry.register("editor", "query", move |payload| {
        result((|| {
            let query: beam_editor_engine::domain::protocol::Query = json::decode(payload)?;
            queries
                .service
                .request(beam_editor_engine::domain::protocol::Request::Query { query })
                .map_err(|e| e.to_string())
        })())
    });
    registry.register("editor", "snapshot", move |_| {
        result(snapshot.snapshot().map_err(|e| e.to_string()))
    });
    let retry = Arc::clone(&controller);
    registry.register("editor", "retry", move |_| {
        result(retry.retry().map_err(|e| e.to_string()))
    });
    let seek = Arc::clone(&controller);
    registry.register("editor", "seek", move |payload| {
        result((|| {
            let request: types::SeekRequest = json::decode(payload)?;
            seek.seek(request.position_ms).map_err(|e| e.to_string())
        })())
    });
    let play = Arc::clone(&controller);
    registry.register("editor", "play", move |payload| {
        result((|| {
            let request: types::PlayRequest = json::decode(payload)?;
            play.play(request.playing).map_err(|e| e.to_string())
        })())
    });
    let export = Arc::clone(&session);
    registry.register("editor", "export", move |payload| {
        let request: types::ExportRequest = match json::decode(payload) {
            Ok(value) => value,
            Err(error) => return ServiceOutcome::Error(error),
        };
        dialog(
            FileDialog::new(FilePickerMode::Save)
                .title("Export video")
                .file_name(format!("Beam.{}", request.container.extension())),
            |paths| {
                let path = paths
                    .into_iter()
                    .next()
                    .ok_or("choose an export destination")?;
                export.export(&path, request.container)?;
                export.export_status()
            },
        )
    });
    let status = Arc::clone(&session);
    registry.register("editor", "exportStatus", move |_| {
        result(status.export_status())
    });
    let cancel = Arc::clone(&session);
    registry.register("editor", "cancelExport", move |_| {
        result(cancel.cancel_export())
    });
    let registration = video::register(&controller);
    let mut registrations = video::register_visuals(registry, Arc::clone(&controller));
    let quality = Arc::clone(&controller);
    registry.register("editor", "quality", move |payload| {
        result((|| {
            let request: types::QualityRequest = json::decode(payload)?;
            quality
                .preview_quality(request.quality)
                .map_err(|error| error.to_string())
        })())
    });
    frame::register(registry, controller, registration.id().get());
    registrations.push(registration);
    Ok(registrations)
}
fn result<T: serde::Serialize>(value: Result<T, String>) -> ServiceOutcome {
    json::respond(value)
}
fn dialog<T: serde::Serialize>(
    dialog: FileDialog,
    operation: impl FnOnce(Vec<PathBuf>) -> Result<T, String>,
) -> ServiceOutcome {
    match pollster::block_on(dialog.open()) {
        Ok(Some(files)) => result(operation(
            files.into_iter().map(|f| f.path().to_owned()).collect(),
        )),
        Ok(None) => ServiceOutcome::Cancelled,
        Err(error) => ServiceOutcome::Error(error.to_string()),
    }
}
