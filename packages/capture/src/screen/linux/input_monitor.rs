use std::{
    io::{BufRead, BufReader},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{
        Arc, Mutex, OnceLock,
        atomic::{AtomicBool, AtomicUsize, Ordering},
        mpsc::{self, Receiver, Sender},
    },
    thread::JoinHandle,
};

use crate::{
    CaptureError,
    input::{InputAccessStatus, NativeInputEvent},
};

const INSTALLED_HELPER: &str = "/usr/libexec/beam-input-helper";

struct BrokerShared {
    ready: AtomicBool,
    mouse_devices: AtomicUsize,
    keyboard_devices: AtomicUsize,
    subscribers: Mutex<Vec<Sender<NativeInputEvent>>>,
}

impl Default for BrokerShared {
    fn default() -> Self {
        Self {
            ready: AtomicBool::new(false),
            mouse_devices: AtomicUsize::new(0),
            keyboard_devices: AtomicUsize::new(0),
            subscribers: Mutex::new(Vec::new()),
        }
    }
}

#[derive(Default)]
struct LinuxInputBroker {
    child: Option<Child>,
    reader: Option<JoinHandle<()>>,
    shared: Arc<BrokerShared>,
}

static BROKER: OnceLock<Mutex<LinuxInputBroker>> = OnceLock::new();

pub(crate) struct LinuxInputMonitor {
    receiver: Receiver<NativeInputEvent>,
}

impl LinuxInputMonitor {
    pub(crate) fn start() -> Result<Option<Self>, CaptureError> {
        let broker = broker()
            .lock()
            .map_err(|_| CaptureError::Backend("input broker lock was poisoned".into()))?;
        if !broker.shared.ready.load(Ordering::Acquire) {
            return Ok(None);
        }
        let (sender, receiver) = mpsc::channel();
        broker
            .shared
            .subscribers
            .lock()
            .map_err(|_| CaptureError::Backend("input subscriber lock was poisoned".into()))?
            .push(sender);
        Ok(Some(Self { receiver }))
    }

    pub(crate) fn drain(&self) -> impl Iterator<Item = NativeInputEvent> + '_ {
        self.receiver.try_iter()
    }

    pub(crate) fn stop(&mut self) {}
}

#[must_use]
pub(crate) fn input_helper_supported() -> bool {
    input_helper_path().is_some() && command_on_path("pkexec")
}

#[must_use]
pub fn linux_input_access_status() -> InputAccessStatus {
    let Ok(broker) = broker().lock() else {
        return InputAccessStatus::unavailable();
    };
    if broker.shared.ready.load(Ordering::Acquire) {
        return InputAccessStatus::available(
            Some(broker.shared.mouse_devices.load(Ordering::Acquire)),
            Some(broker.shared.keyboard_devices.load(Ordering::Acquire)),
        );
    }
    if input_helper_supported() {
        InputAccessStatus::required()
    } else {
        InputAccessStatus::unavailable()
    }
}

pub fn request_linux_input_access() -> Result<InputAccessStatus, CaptureError> {
    if !command_on_path("pkexec") {
        return Err(CaptureError::Unsupported(
            "Polkit pkexec is not available".into(),
        ));
    }
    let helper = ensure_installed_helper()?;
    let mut broker = broker()
        .lock()
        .map_err(|_| CaptureError::Backend("input broker lock was poisoned".into()))?;
    if broker.shared.ready.load(Ordering::Acquire) {
        return Ok(linux_input_access_status_from(&broker));
    }
    broker.stop();

    let mut child = Command::new("pkexec")
        .arg(helper)
        .arg("stream")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| CaptureError::Backend(format!("input helper failed to start: {error}")))?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| CaptureError::Backend("input helper stdout was unavailable".into()))?;
    let mut reader = BufReader::new(stdout);
    let mut ready_line = String::new();
    if reader
        .read_line(&mut ready_line)
        .map_err(|error| CaptureError::Backend(format!("input helper readiness failed: {error}")))?
        == 0
    {
        let _ = child.wait();
        return Err(CaptureError::PermissionDenied(
            "interaction access was not authorized".into(),
        ));
    }
    let ready: serde_json::Value = serde_json::from_str(&ready_line)?;
    if ready.get("event").and_then(serde_json::Value::as_str) != Some("ready") {
        let _ = child.kill();
        let _ = child.wait();
        return Err(CaptureError::Backend(
            "input helper returned an invalid readiness response".into(),
        ));
    }

    let mouse_devices = ready
        .get("mouseDevices")
        .and_then(serde_json::Value::as_u64)
        .and_then(|value| usize::try_from(value).ok())
        .unwrap_or(0);
    let keyboard_devices = ready
        .get("keyboardDevices")
        .and_then(serde_json::Value::as_u64)
        .and_then(|value| usize::try_from(value).ok())
        .unwrap_or(0);
    broker
        .shared
        .mouse_devices
        .store(mouse_devices, Ordering::Release);
    broker
        .shared
        .keyboard_devices
        .store(keyboard_devices, Ordering::Release);
    broker.shared.ready.store(true, Ordering::Release);

    let shared = broker.shared.clone();
    broker.reader = Some(
        std::thread::Builder::new()
            .name("beam-linux-input-broker".into())
            .spawn(move || {
                for line in reader.lines().map_while(Result::ok) {
                    let Ok(event) = serde_json::from_str::<NativeInputEvent>(&line) else {
                        continue;
                    };
                    if let Ok(mut subscribers) = shared.subscribers.lock() {
                        subscribers.retain(|subscriber| subscriber.send(event.clone()).is_ok());
                    }
                }
                shared.ready.store(false, Ordering::Release);
                if let Ok(mut subscribers) = shared.subscribers.lock() {
                    subscribers.clear();
                }
            })
            .map_err(|error| {
                CaptureError::Backend(format!("input broker reader failed to start: {error}"))
            })?,
    );
    broker.child = Some(child);
    Ok(linux_input_access_status_from(&broker))
}

pub fn shutdown_linux_input_access() {
    if let Ok(mut broker) = broker().lock() {
        broker.stop();
    }
}

impl LinuxInputBroker {
    fn stop(&mut self) {
        self.shared.ready.store(false, Ordering::Release);
        if let Some(mut child) = self.child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
        if let Some(reader) = self.reader.take() {
            let _ = reader.join();
        }
        if let Ok(mut subscribers) = self.shared.subscribers.lock() {
            subscribers.clear();
        }
    }
}

fn broker() -> &'static Mutex<LinuxInputBroker> {
    BROKER.get_or_init(|| Mutex::new(LinuxInputBroker::default()))
}

fn linux_input_access_status_from(broker: &LinuxInputBroker) -> InputAccessStatus {
    InputAccessStatus::available(
        Some(broker.shared.mouse_devices.load(Ordering::Acquire)),
        Some(broker.shared.keyboard_devices.load(Ordering::Acquire)),
    )
}

fn input_helper_path() -> Option<PathBuf> {
    let installed = PathBuf::from(INSTALLED_HELPER);
    bundled_input_helper_path().or_else(|| executable_file(&installed).then_some(installed))
}

fn bundled_input_helper_path() -> Option<PathBuf> {
    std::env::var_os("BEAM_INPUT_HELPER_PATH")
        .map(PathBuf::from)
        .filter(|path| executable_file(path))
}

fn ensure_installed_helper() -> Result<PathBuf, CaptureError> {
    let installed = PathBuf::from(INSTALLED_HELPER);
    if let Some(bundled) = bundled_input_helper_path()
        && bundled != installed
        && (!executable_file(&installed) || helper_version(&bundled) != helper_version(&installed))
    {
        let status = Command::new("pkexec")
            .arg(&bundled)
            .arg("install")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map_err(|error| {
                CaptureError::Backend(format!(
                    "input helper installation failed to start: {error}"
                ))
            })?;
        if !status.success() {
            return Err(CaptureError::PermissionDenied(
                "interaction access installation was not authorized".into(),
            ));
        }
    }
    executable_file(&installed)
        .then_some(installed)
        .ok_or_else(|| CaptureError::Unsupported("Beam input helper is not installed".into()))
}

fn helper_version(path: &Path) -> Option<(String, u64)> {
    let output = Command::new(path)
        .arg("version")
        .stdin(Stdio::null())
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    parse_helper_version(&output.stdout)
}

pub(super) fn parse_helper_version(output: &[u8]) -> Option<(String, u64)> {
    let value = serde_json::from_slice::<serde_json::Value>(output).ok()?;
    Some((
        value.get("version")?.as_str()?.to_owned(),
        value.get("policyVersion")?.as_u64()?,
    ))
}

fn executable_file(path: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;

    std::fs::metadata(path)
        .is_ok_and(|metadata| metadata.is_file() && metadata.permissions().mode() & 0o111 != 0)
}

fn command_on_path(command: &str) -> bool {
    std::env::var_os("PATH").is_some_and(|value| {
        std::env::split_paths(&value).any(|directory| executable_file(&directory.join(command)))
    })
}
