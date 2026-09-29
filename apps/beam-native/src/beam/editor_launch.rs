//! Waits for the editor's first usable snapshot before reporting an opened project.

use std::{
    fs,
    io::Read,
    path::Path,
    process::{Child, Command, Stdio},
    sync::{
        Arc, Mutex,
        atomic::{AtomicU64, Ordering},
    },
    time::{Duration, Instant},
};

use serde_json::{Value, json};

use super::{outcome, requests};
use crate::ServiceRegistry;

const READY_PATH: &str = "BEAM_EDITOR_STARTUP_FILE";
const STARTUP_TIMEOUT: Duration = Duration::from_secs(60);
const STDERR_TAIL: usize = 16 * 1024;

pub(super) fn register(registry: &Arc<ServiceRegistry>) {
    let generation = Arc::new(AtomicU64::new(0));
    let open_generation = Arc::clone(&generation);
    registry.register("beam", "openEditor", move |payload| {
        let current = open_generation.fetch_add(1, Ordering::AcqRel) + 1;
        outcome(open_editor(payload, &open_generation, current))
    });
    registry.register("beam", "cancelEditorOpen", move |_| {
        generation.fetch_add(1, Ordering::AcqRel);
        outcome(Ok(Value::Null))
    });
    registry.register("beam", "editorStartup", move |payload| {
        outcome(report_startup(payload))
    });
}

fn open_editor(payload: Value, generation: &AtomicU64, current: u64) -> Result<Value, String> {
    let argument = requests::editor_argument(payload)?;
    let marker = std::env::temp_dir().join(format!("beam-editor-{}.json", uuid::Uuid::new_v4()));
    let mut child = Command::new(std::env::current_exe().map_err(|error| error.to_string())?)
        .arg(argument)
        .env(READY_PATH, &marker)
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Could not start the editor: {error}"))?;
    let diagnostics = stderr_tail(&mut child);
    let result = await_startup(
        &mut child,
        &marker,
        &diagnostics,
        generation,
        current,
        STARTUP_TIMEOUT,
    );
    let _ = fs::remove_file(format!("{}.pending", marker.display()));
    let _ = fs::remove_file(marker);
    result.map(|()| Value::Null)
}

fn stderr_tail(child: &mut Child) -> Arc<Mutex<Vec<u8>>> {
    let output = Arc::new(Mutex::new(Vec::new()));
    if let Some(mut stderr) = child.stderr.take() {
        let sink = Arc::clone(&output);
        std::thread::spawn(move || {
            let mut chunk = [0_u8; 2048];
            while let Ok(count) = stderr.read(&mut chunk) {
                if count == 0 {
                    break;
                }
                let mut tail = sink.lock().unwrap_or_else(|poison| poison.into_inner());
                tail.extend_from_slice(&chunk[..count]);
                let overflow = tail.len().saturating_sub(STDERR_TAIL);
                if overflow > 0 {
                    tail.drain(..overflow);
                }
            }
        });
    }
    output
}

fn await_startup(
    child: &mut Child,
    marker: &Path,
    diagnostics: &Mutex<Vec<u8>>,
    generation: &AtomicU64,
    current: u64,
    timeout: Duration,
) -> Result<(), String> {
    let started = Instant::now();
    loop {
        if generation.load(Ordering::Acquire) != current {
            stop_child(child);
            return Err("Editor opening canceled; the recording remains in Projects.".into());
        }
        if let Ok(contents) = fs::read_to_string(marker) {
            let result = parse_startup(&contents);
            if generation.load(Ordering::Acquire) != current {
                stop_child(child);
                return Err("Editor opening canceled; the recording remains in Projects.".into());
            }
            if result.is_err() {
                stop_child(child);
            }
            return result;
        }
        if let Some(exit) = child.try_wait().map_err(|error| error.to_string())? {
            std::thread::sleep(Duration::from_millis(50));
            let tail = String::from_utf8_lossy(
                &diagnostics
                    .lock()
                    .unwrap_or_else(|poison| poison.into_inner()),
            )
            .trim()
            .to_owned();
            return Err(if tail.is_empty() {
                format!("Editor exited before opening ({exit}).")
            } else {
                format!("Editor exited before opening ({exit}): {tail}")
            });
        }
        if started.elapsed() >= timeout {
            stop_child(child);
            return Err("The editor did not become ready within 60 seconds. The recording remains in Projects.".into());
        }
        std::thread::sleep(Duration::from_millis(40));
    }
}

fn parse_startup(contents: &str) -> Result<(), String> {
    let status: Value = serde_json::from_str(contents)
        .map_err(|error| format!("Invalid editor startup response: {error}"))?;
    if let Some(error) = status.get("error").and_then(Value::as_str) {
        return Err(format!("The editor could not load the recording: {error}"));
    }
    if status.get("ready").and_then(Value::as_bool) == Some(true) {
        return Ok(());
    }
    Err("Invalid editor startup response: missing ready state".into())
}

fn stop_child(child: &mut Child) {
    let _ = child.kill();
    let _ = child.wait();
}

fn report_startup(payload: Value) -> Result<Value, String> {
    let Ok(path) = std::env::var(READY_PATH) else {
        return Ok(Value::Null);
    };
    let response = if let Some(error) = payload.get("error").and_then(Value::as_str) {
        json!({ "error": error })
    } else {
        json!({ "ready": true })
    };
    let pending = format!("{path}.pending");
    fs::write(&pending, response.to_string()).map_err(|error| error.to_string())?;
    fs::rename(pending, path).map_err(|error| error.to_string())?;
    Ok(Value::Null)
}

#[cfg(test)]
#[path = "../../test/beam/editor_launch.rs"]
mod tests;
