//! Beam-specific services exposed to the native Solid presentation.

mod audio_meters;
mod desktop_capture;
mod editor_launch;
mod info;
mod preferences;
mod requests;
mod teleprompter;
mod types;
mod updater;
pub(crate) use crate::{files, json};

use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
    sync::{Arc, Mutex},
};

use beam_media_engine::{
    OutputLocation, ProjectId, RecordingController, RecordingStatus, StillConfig,
};
use json::{JsonFile, Writer};
use requests::recording_config;
use serde_json::Value;
use types::{
    ActiveCapture, CaptureRequest, CaptureStatus, ScreenshotMetadata, ScreenshotResult,
    SourceCatalog, SourceOption,
};

use crate::{ServiceOutcome, ServiceRegistry};
use preferences::Preferences;
pub(crate) use preferences::{HUD_MAX_SIZE, HUD_MIN_SIZE};

pub(crate) fn projects_root() -> Result<PathBuf, String> {
    Preferences::new()?.projects_root()
}

pub(crate) fn initial_preferences() -> Result<preferences::NativePreferences, String> {
    json::decode(Preferences::new()?.initialize()?)
}

pub(crate) fn register(registry: &Arc<ServiceRegistry>) -> Result<(), String> {
    info::register(registry);
    let preferences = Preferences::new()?;
    let projects = preferences.projects_root()?;
    let controller = RecordingController::new(&projects).map_err(|error| error.to_string())?;
    let active = Arc::new(Mutex::new(None::<ActiveCapture>));
    let desktop = Arc::new(Mutex::new(None::<desktop_capture::Monitor>));
    let meters = audio_meters::register(registry, controller.clone(), active.clone())?;
    updater::register(registry, controller.clone())?;

    let read = preferences.clone();
    registry.register("beam", "preferences", move |_| outcome(read.view()));
    let write = preferences.clone();
    let events = Arc::downgrade(registry);
    let writes = Mutex::new(());
    registry.register("beam", "savePreferences", move |patch| {
        let _write = writes.lock().unwrap_or_else(|poison| poison.into_inner());
        let result = write.patch(&patch);
        if let Ok(preferences) = &result
            && let Some(registry) = events.upgrade()
        {
            crate::desktop_application::preferences_changed(&registry, preferences);
        }
        outcome(result)
    });
    teleprompter::register(registry, preferences.clone());

    let sources = controller.clone();
    registry.register("beam", "sources", move |_| {
        outcome(source_catalog(&sources))
    });
    registry.register("beam", "desktopCapabilities", move |_| {
        outcome(
            beam_screen::desktop::appearance::capabilities()
                .map_err(|error| error.to_string())
                .and_then(|value| json::encode(&value)),
        )
    });

    let prepare = controller.clone();
    let prepare_active = Arc::clone(&active);
    let script_preferences = preferences.clone();
    let prepare_meters = meters.clone();
    let prepare_desktop = desktop.clone();
    let preparing = Mutex::new(());
    registry.register("beam", "prepare", move |request| {
        let _preparing = preparing
            .lock()
            .unwrap_or_else(|poison| poison.into_inner());
        if prepare_active
            .lock()
            .unwrap_or_else(|poison| poison.into_inner())
            .is_some()
        {
            return ServiceOutcome::Error("a recording is already prepared".into());
        }
        let mut config = match recording_config(request) {
            Ok(config) => config,
            Err(error) => return ServiceOutcome::Error(error),
        };
        let project = config.project_id;
        let output = config.output;
        if let Err(error) = prepare_meters.suspend() {
            prepare_meters.enable();
            return ServiceOutcome::Error(error);
        }
        let appearance = match desktop_capture::begin(&script_preferences) {
            Ok(appearance) => appearance,
            Err(error) => {
                prepare_meters.enable();
                return ServiceOutcome::Error(error);
            }
        };
        if let Some(screen) = &mut config.screen
            && let Some(appearance) = &appearance
        {
            screen
                .excluded_window_handles
                .extend(appearance.excluded_window_handles());
        }
        match prepare.prepare(config) {
            Ok(status) => {
                let Some(id) = status.session_id else {
                    prepare_meters.enable();
                    return ServiceOutcome::Error("engine returned no session ID".into());
                };
                if let Some(manifest) = &status.manifest_path
                    && let Err(error) = teleprompter::checkpoint(&script_preferences, manifest)
                {
                    let _ = prepare.cancel(id);
                    prepare_meters.enable();
                    return ServiceOutcome::Error(error);
                }
                if let Some(appearance) = appearance {
                    let monitor = match desktop_capture::Monitor::new(appearance, prepare.clone()) {
                        Ok(monitor) => monitor,
                        Err(error) => {
                            let _ = prepare.cancel(id);
                            prepare_meters.enable();
                            return ServiceOutcome::Error(error);
                        }
                    };
                    *prepare_desktop
                        .lock()
                        .unwrap_or_else(|poison| poison.into_inner()) = Some(monitor);
                }
                *prepare_active
                    .lock()
                    .unwrap_or_else(|poison| poison.into_inner()) = Some(ActiveCapture {
                    id,
                    project,
                    output,
                });
                outcome(status_json(status, Some(project)))
            }
            Err(error) => {
                prepare_meters.enable();
                ServiceOutcome::Error(error.to_string())
            }
        }
    });

    for (name, operation) in [
        (
            "start",
            RecordingController::start as fn(&RecordingController, _) -> _,
        ),
        ("pause", RecordingController::pause),
        ("resume", RecordingController::resume),
        ("reset", RecordingController::restart),
        ("stop", RecordingController::stop),
        ("cancel", RecordingController::cancel),
    ] {
        let controller = controller.clone();
        let active = Arc::clone(&active);
        let projects_root = projects.clone();
        let meters = meters.clone();
        let desktop = desktop.clone();
        registry.register("beam", name, move |_| {
            let mut current = active.lock().unwrap_or_else(|poison| poison.into_inner());
            let Some(capture) = *current else {
                return ServiceOutcome::Error("no prepared recording".into());
            };
            match operation(&controller, capture.id) {
                Ok(mut status) => {
                    if name == "reset" {
                        let Some(id) = status.session_id else {
                            return ServiceOutcome::Error(
                                "restarted recording has no session ID".into(),
                            );
                        };
                        *current = Some(ActiveCapture { id, ..capture });
                    }
                    if matches!(name, "stop" | "cancel") {
                        *current = None;
                        meters.enable();
                        desktop_capture::restore(&desktop, &mut status);
                    }
                    if name == "cancel" {
                        let category = match capture.output {
                            OutputLocation::Studio => files::STUDIO_DIRECTORY,
                            OutputLocation::Instant => files::INSTANT_DIRECTORY,
                            OutputLocation::ProjectRoot => {
                                return ServiceOutcome::Error("invalid capture output".into());
                            }
                        };
                        let directory = projects_root
                            .join(category)
                            .join(capture.project.to_string());
                        if directory.exists()
                            && let Err(error) = fs::remove_dir_all(&directory)
                        {
                            return ServiceOutcome::Error(format!(
                                "could not delete recording: {error}"
                            ));
                        }
                    }
                    outcome(status_json(status, Some(capture.project)))
                }
                Err(error) => {
                    let mut status = controller.status();
                    if desktop_capture::terminal(status.state) {
                        desktop_capture::restore(&desktop, &mut status);
                        *current = None;
                        meters.enable();
                    }
                    ServiceOutcome::Error(status.error.unwrap_or_else(|| error.to_string()))
                }
            }
        });
    }
    let status = controller.clone();
    let status_active = Arc::clone(&active);
    let status_desktop = desktop.clone();
    registry.register("beam", "status", move |_| {
        let project = status_active
            .lock()
            .unwrap_or_else(|poison| poison.into_inner())
            .map(|active| active.project);
        let mut value = status.status();
        if desktop_capture::terminal(value.state) {
            desktop_capture::restore(&status_desktop, &mut value);
        }
        outcome(status_json(value, project))
    });

    let project_library = projects.clone();
    let still = controller.clone();
    registry.register("beam", "screenshot", move |request| {
        outcome((|| {
            let mut appearance = desktop_capture::begin(&preferences)?;
            let excluded = appearance
                .as_ref()
                .map_or_else(Vec::new, |value| value.excluded_window_handles());
            let result = capture_still(&still, &projects, &request, excluded);
            if let Some(appearance) = &mut appearance {
                appearance.restore().map_err(|error| error.to_string())?;
            }
            result
        })())
    });
    registry.register("beam", "openVideoEditor", move |_| {
        outcome((|| {
            Command::new(std::env::current_exe().map_err(|e| e.to_string())?)
                .arg("--editor")
                .spawn()
                .map_err(|e| e.to_string())?;
            Ok(Value::Null)
        })())
    });
    editor_launch::register(registry);
    registry.register("beam", "listProjects", move |_| {
        outcome(
            crate::editor::list_projects(&project_library).and_then(|items| json::encode(&items)),
        )
    });
    registry.register("beam", "inputAccessStatus", move |_| {
        outcome(json::encode(&beam_screen::input::input_access_status()))
    });
    let input_events = Arc::downgrade(registry);
    registry.register("beam", "requestInputAccess", move |_| {
        let result = beam_screen::input::request_input_access()
            .map_err(|error| error.to_string())
            .and_then(|status| json::encode(&status));
        if let Some(registry) = input_events.upgrade() {
            registry.broadcast_event(&serde_json::json!({ "type": "inputAccessChanged" }));
        }
        outcome(result)
    });
    #[cfg(target_os = "linux")]
    if !crate::editor::is_editor() {
        let events = Arc::downgrade(registry);
        std::thread::spawn(move || {
            let _ = beam_screen::screen::linux::auto_start_installed_linux_input_access();
            if let Some(registry) = events.upgrade() {
                registry.broadcast_event(&serde_json::json!({ "type": "inputAccessChanged" }));
            }
        });
    }
    Ok(())
}

fn outcome(result: Result<Value, String>) -> ServiceOutcome {
    match result {
        Ok(value) => ServiceOutcome::Ok(value),
        Err(error) => ServiceOutcome::Error(error),
    }
}

fn source_catalog(controller: &RecordingController) -> Result<Value, String> {
    let sources = controller.list_sources();
    let mut errors = Vec::new();
    let screens = sources
        .screens
        .map(|items| {
            items
                .into_iter()
                .map(|item| SourceOption {
                    id: item.id.to_string(),
                    label: item.label,
                    kind: Some(item.kind),
                    is_default: Some(item.is_default),
                })
                .collect()
        })
        .unwrap_or_else(|error| {
            errors.push(error);
            Vec::new()
        });
    let cameras = sources
        .cameras
        .map(|items| {
            items
                .into_iter()
                .map(|item| SourceOption {
                    id: item.id,
                    label: item.name,
                    kind: None,
                    is_default: None,
                })
                .collect()
        })
        .unwrap_or_else(|error| {
            errors.push(error);
            Vec::new()
        });
    let microphones = sources
        .microphones
        .map(|items| {
            items
                .into_iter()
                .map(|item| SourceOption {
                    id: item.id,
                    label: item.name,
                    kind: None,
                    is_default: Some(item.is_default),
                })
                .collect()
        })
        .unwrap_or_else(|error| {
            errors.push(error);
            Vec::new()
        });
    let system_outputs = sources
        .system_outputs
        .map(|items| {
            items
                .into_iter()
                .map(|item| SourceOption {
                    id: item.id,
                    label: item.name,
                    kind: None,
                    is_default: Some(item.is_default),
                })
                .collect()
        })
        .unwrap_or_else(|error| {
            errors.push(error);
            Vec::new()
        });
    json::encode(&SourceCatalog {
        screens,
        cameras,
        microphones,
        system_outputs,
        errors,
    })
}

fn status_json(status: RecordingStatus, project: Option<ProjectId>) -> Result<Value, String> {
    json::encode(&CaptureStatus {
        status,
        project_id: project,
    })
}

fn capture_still(
    controller: &RecordingController,
    projects: &Path,
    request: &Value,
    excluded_window_handles: Vec<String>,
) -> Result<Value, String> {
    let request: CaptureRequest = json::decode(request.clone())?;
    if !matches!(request.mode, preferences::CaptureMode::Screenshot) {
        return Err("expected screenshot mode".into());
    }
    let project = ProjectId::new();
    let selection = requests::source(&request)?;
    let result = controller
        .capture_still(StillConfig {
            project_id: project,
            screen: selection,
            region: requests::region(&request)?,
            excluded_window_handles,
        })
        .map_err(|error| error.to_string())?;
    let destination = projects
        .join(files::SCREENSHOT_DIRECTORY)
        .join(project.to_string());
    fs::create_dir_all(&destination).map_err(|error| error.to_string())?;
    let final_image = destination.join(files::SCREENSHOT_IMAGE);
    fs::rename(&result.path, &final_image)
        .or_else(|_| {
            fs::copy(&result.path, &final_image)?;
            fs::remove_file(&result.path)
        })
        .map_err(|error| error.to_string())?;
    let metadata = ScreenshotMetadata {
        schema_version: 1,
        id: project,
        name: "Screenshot".into(),
        width: result.width,
        height: result.height,
        state: None,
    };
    JsonFile::new(destination.join(files::SCREENSHOT_METADATA)).write(&metadata)?;
    fs::remove_dir_all(projects.join(project.to_string())).map_err(|error| error.to_string())?;
    json::encode(&ScreenshotResult {
        project_id: project,
        path: final_image,
    })
}
