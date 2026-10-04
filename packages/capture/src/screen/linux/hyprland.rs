use std::{
    io::{Read, Write},
    os::unix::{fs::FileTypeExt, net::UnixStream},
    path::{Path, PathBuf},
    sync::{Arc, Mutex, mpsc},
    thread::{self, JoinHandle},
    time::{Duration, Instant},
};

use super::{
    pipewire::{CursorMetadata, NegotiatedFormat, VideoTransform},
    portal::PreparedPortal,
};
use crate::{CaptureError, NativeCaptureErrorCode};

#[path = "hyprland_types.rs"]
mod types;
use types::{CursorSnapshot, HyprlandMonitor};

const IPC_TIMEOUT: Duration = Duration::from_millis(20);
const SAMPLE_INTERVAL: Duration = Duration::from_millis(16);
const MAX_SAMPLE_AGE: Duration = Duration::from_millis(250);

fn socket_path() -> Option<PathBuf> {
    let runtime_dir = PathBuf::from(std::env::var_os("XDG_RUNTIME_DIR")?);
    let signature = std::env::var("HYPRLAND_INSTANCE_SIGNATURE").ok()?;
    if !runtime_dir.is_absolute()
        || signature.is_empty()
        || !signature
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'))
    {
        return None;
    }
    let path = runtime_dir
        .join("hypr")
        .join(signature)
        .join(".socket.sock");
    path.metadata()
        .ok()?
        .file_type()
        .is_socket()
        .then_some(path)
}

pub(crate) fn is_hyprland() -> bool {
    socket_path().is_some()
}

fn query(path: &Path, command: &[u8]) -> Option<Vec<u8>> {
    let mut stream = UnixStream::connect(path).ok()?;
    let deadline = Instant::now() + IPC_TIMEOUT;
    stream.set_write_timeout(Some(IPC_TIMEOUT)).ok()?;
    stream.write_all(command).ok()?;
    let mut response = Vec::new();
    let mut chunk = [0; 1024];
    loop {
        let remaining = deadline.checked_duration_since(Instant::now())?;
        stream.set_read_timeout(Some(remaining)).ok()?;
        let read = stream.read(&mut chunk).ok()?;
        if read == 0 {
            return Some(response);
        }
        response.extend_from_slice(&chunk[..read]);
        if response.len() > 32768 {
            return None;
        }
    }
}

fn parse_cursor_pos(response: &[u8]) -> Option<(i32, i32)> {
    let text = std::str::from_utf8(response).ok()?;
    let (x, y) = text.trim().split_once(',')?;
    Some((x.trim().parse().ok()?, y.trim().parse().ok()?))
}

fn query_monitors(path: &Path) -> Option<Vec<HyprlandMonitor>> {
    serde_json::from_slice(&query(path, b"j/monitors")?).ok()
}

fn select_monitor(
    monitors: &[HyprlandMonitor],
    mapping_id: Option<&str>,
    size: Option<(i32, i32)>,
) -> Option<HyprlandMonitor> {
    let candidates: Vec<_> = monitors
        .iter()
        .filter(|monitor| {
            if !monitor.valid() {
                return false;
            }
            if let Some(name) = mapping_id {
                return monitor.name == name;
            }
            monitors.len() == 1 || size.is_some_and(|size| monitor.matches_size(size))
        })
        .collect();
    match candidates.as_slice() {
        [monitor] => Some((**monitor).clone()),
        _ => None,
    }
}

pub(crate) struct HyprlandCursor {
    snapshot: Arc<Mutex<Option<CursorSnapshot>>>,
    stop: mpsc::Sender<()>,
    worker: Option<JoinHandle<()>>,
}

impl HyprlandCursor {
    pub(super) fn for_portal(portal: &PreparedPortal) -> Result<Option<Self>, CaptureError> {
        if !portal.hyprland_cursor {
            return Ok(None);
        }
        let path = socket_path().ok_or_else(|| cursor_error("Hyprland IPC is unavailable"))?;
        let monitors =
            query_monitors(&path).ok_or_else(|| cursor_error("Cannot query Hyprland monitors"))?;
        let monitor = select_monitor(&monitors, portal.mapping_id.as_deref(), portal.size)
            .ok_or_else(|| {
                cursor_error("Cannot identify the selected monitor for separate cursor capture")
            })?;
        Self::start(path, monitor).map(Some)
    }

    fn start(path: PathBuf, mut monitor: HyprlandMonitor) -> Result<Self, CaptureError> {
        let point = query(&path, b"/cursorpos")
            .and_then(|response| parse_cursor_pos(&response))
            .ok_or_else(|| cursor_error("Cannot query the Hyprland cursor position"))?;
        let snapshot = Arc::new(Mutex::new(Some(CursorSnapshot {
            point,
            monitor: monitor.clone(),
            received: Instant::now(),
        })));
        let output = snapshot.clone();
        let (stop, receiver) = mpsc::channel();
        let worker = thread::Builder::new()
            .name("beam-hyprland-cursor".into())
            .spawn(move || {
                let mut refreshed = Instant::now();
                while matches!(
                    receiver.recv_timeout(SAMPLE_INTERVAL),
                    Err(mpsc::RecvTimeoutError::Timeout)
                ) {
                    if refreshed.elapsed() >= Duration::from_secs(1) {
                        let updated = query_monitors(&path).and_then(|monitors| {
                            select_monitor(&monitors, Some(&monitor.name), None)
                        });
                        let Some(updated) = updated else {
                            if let Ok(mut output) = output.lock() {
                                *output = None;
                            }
                            break;
                        };
                        monitor = updated;
                        refreshed = Instant::now();
                    }
                    let point = query(&path, b"/cursorpos")
                        .and_then(|response| parse_cursor_pos(&response));
                    if let Ok(mut output) = output.lock() {
                        *output = point.map(|point| CursorSnapshot {
                            point,
                            monitor: monitor.clone(),
                            received: Instant::now(),
                        });
                    }
                }
            })
            .map_err(|error| {
                cursor_error(&format!("Cannot start Hyprland cursor sampling: {error}"))
            })?;
        Ok(Self {
            snapshot,
            stop,
            worker: Some(worker),
        })
    }

    pub(super) fn metadata(
        &self,
        format: NegotiatedFormat,
        transform: VideoTransform,
    ) -> Option<CursorMetadata> {
        let snapshot = self.snapshot.lock().ok()?;
        let snapshot = snapshot.as_ref()?;
        if snapshot.received.elapsed() > MAX_SAMPLE_AGE {
            return None;
        }
        snapshot.metadata(format, transform)
    }
}

impl Drop for HyprlandCursor {
    fn drop(&mut self) {
        let _ = self.stop.send(());
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}

fn cursor_error(message: &str) -> CaptureError {
    CaptureError::native(
        NativeCaptureErrorCode::PortalCursorMetadataUnavailable,
        message,
    )
}

#[cfg(test)]
#[path = "hyprland_tests.rs"]
mod tests;
