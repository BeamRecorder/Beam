//! Narrow services for the native NLE. GES and project storage stay in Rust.
mod files;
mod frame;
mod types;
mod video;
mod window;
use crate::{ServiceOutcome, ServiceRegistry, json};
use argui_platform::file_picker::{FileDialog, FilePickerMode};
use argui_render::GpuCanvasRegistration;
use beam_editor_engine::EditorController;
use std::{path::PathBuf, sync::Arc};
pub(crate) use window::{is_editor, window_config};

/// Registers typed editor operations and native file dialogs before the scene mounts.
pub(crate) fn register(
    registry: &Arc<ServiceRegistry>,
    root: PathBuf,
) -> Result<GpuCanvasRegistration, String> {
    let controller = Arc::new(EditorController::new().map_err(|e| e.to_string())?);
    let initial = Arc::clone(&controller);
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
    let new = Arc::clone(&controller);
    registry.register("editor", "new", move |_| result(files::create(&new, &root)));
    let open = Arc::clone(&controller);
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
    let import = Arc::clone(&controller);
    registry.register("editor", "import", move |_| {
        dialog(
            FileDialog::new(FilePickerMode::Files).title("Import media"),
            |paths| import.import(paths).map_err(|e| e.to_string()),
        )
    });
    let edit = Arc::clone(&controller);
    registry.register("editor", "edit", move |payload| {
        result((|| {
            let request: types::EditRequest = json::decode(payload)?;
            edit.edit(request.revision, request.edit)
                .map_err(|e| e.to_string())
        })())
    });
    let snapshot = Arc::clone(&controller);
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
    let export = Arc::clone(&controller);
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
                export
                    .export(path, request.container)
                    .map_err(|e| e.to_string())?;
                Ok(export.export_status())
            },
        )
    });
    let status = Arc::clone(&controller);
    registry.register("editor", "exportStatus", move |_| {
        result(Ok(status.export_status()))
    });
    let cancel = Arc::clone(&controller);
    registry.register("editor", "cancelExport", move |_| {
        cancel.cancel_export();
        ServiceOutcome::Ok(serde_json::Value::Null)
    });
    let registration = video::register(&controller);
    video::register_visuals(registry, Arc::clone(&controller));
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
    Ok(registration)
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
