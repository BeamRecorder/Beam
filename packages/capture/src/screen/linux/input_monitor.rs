use std::{
    collections::VecDeque,
    fs::{self, File, OpenOptions},
    io::{BufRead, BufReader},
    os::{
        fd::{AsRawFd, FromRawFd},
        unix::fs::{OpenOptionsExt, PermissionsExt},
    },
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{
        Arc, Mutex, OnceLock, Weak,
        atomic::{AtomicBool, AtomicUsize, Ordering},
    },
    thread::JoinHandle,
};

use crate::{
    CaptureError,
    input::{InputAccessStatus, InputAccessUnavailableReason, NativeInputEvent},
};

use super::owned_child;

const INSTALLED_HELPER: &str = "/usr/libexec/beam-input-helper";
pub(super) const INPUT_QUEUE_CAPACITY: usize = 4_096;

pub(super) struct ElevatedHelperExecutable {
    path: PathBuf,
    _sealed_file: Option<File>,
}

pub(super) struct InputEventQueue {
    pub(super) events: VecDeque<NativeInputEvent>,
    pub(super) accepting: bool,
}

impl Default for InputEventQueue {
    fn default() -> Self {
        Self {
            events: VecDeque::new(),
            accepting: true,
        }
    }
}

struct BrokerShared {
    ready: AtomicBool,
    mouse_devices: AtomicUsize,
    keyboard_devices: AtomicUsize,
    subscribers: Mutex<Vec<Weak<Mutex<InputEventQueue>>>>,
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
    queue: Arc<Mutex<InputEventQueue>>,
}

impl LinuxInputMonitor {
    pub(crate) fn start() -> Result<Option<Self>, CaptureError> {
        let broker = broker()
            .lock()
            .map_err(|_| CaptureError::Backend("input broker lock was poisoned".into()))?;
        if !broker.shared.ready.load(Ordering::Acquire) {
            return Ok(None);
        }
        let queue = Arc::new(Mutex::new(InputEventQueue::default()));
        broker
            .shared
            .subscribers
            .lock()
            .map_err(|_| CaptureError::Backend("input subscriber lock was poisoned".into()))?
            .push(Arc::downgrade(&queue));
        Ok(Some(Self { queue }))
    }

    pub(crate) fn drain(&self) -> Vec<NativeInputEvent> {
        let Ok(mut queue) = self.queue.lock() else {
            return Vec::new();
        };
        queue.events.drain(..).collect()
    }

    pub(crate) fn stop(&mut self) {
        if let Ok(mut queue) = self.queue.lock() {
            queue.accepting = false;
        }
    }
}

#[must_use]
pub(crate) fn input_helper_supported() -> bool {
    input_helper_path().is_some() && command_on_path("pkexec")
}

#[must_use]
pub fn linux_input_access_status() -> InputAccessStatus {
    if input_helper_path().is_none() {
        return InputAccessStatus::unavailable_for(
            InputAccessUnavailableReason::InputHelperUnavailable,
        );
    }
    if !command_on_path("pkexec") {
        return InputAccessStatus::unavailable_for(InputAccessUnavailableReason::PolkitUnavailable);
    }
    let Ok(broker) = broker().lock() else {
        return InputAccessStatus::unavailable_for(
            InputAccessUnavailableReason::InputBrokerUnavailable,
        );
    };
    if broker.shared.ready.load(Ordering::Acquire) {
        return InputAccessStatus::available(
            Some(broker.shared.mouse_devices.load(Ordering::Acquire)),
            Some(broker.shared.keyboard_devices.load(Ordering::Acquire)),
        );
    }
    match helper_launch() {
        Ok((_, "install-stream")) => InputAccessStatus::installation_required(),
        Ok(_) => InputAccessStatus::required(),
        Err(_) => {
            InputAccessStatus::unavailable_for(InputAccessUnavailableReason::InputHelperUnavailable)
        }
    }
}

pub fn request_linux_input_access() -> Result<InputAccessStatus, CaptureError> {
    if !command_on_path("pkexec") {
        return Err(CaptureError::Unsupported(
            "Polkit pkexec is not available".into(),
        ));
    }
    let (helper, helper_command) = helper_launch()?;
    let mut broker = broker()
        .lock()
        .map_err(|_| CaptureError::Backend("input broker lock was poisoned".into()))?;
    if broker.shared.ready.load(Ordering::Acquire) {
        return Ok(linux_input_access_status_from(&broker));
    }
    broker.stop();

    let mut command = Command::new("pkexec");
    command
        .arg(helper.path())
        .arg(helper_command)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    owned_child::configure(&mut command);
    let mut child = command
        .spawn()
        .map_err(|error| CaptureError::Backend(format!("input helper failed to start: {error}")))?;
    owned_child::register(&child);
    let Some(stdout) = child.stdout.take() else {
        owned_child::kill_and_wait(&mut child);
        return Err(CaptureError::Backend(
            "input helper stdout was unavailable".into(),
        ));
    };
    let mut reader = BufReader::new(stdout);
    let mut ready_line = String::new();
    match reader.read_line(&mut ready_line) {
        Ok(0) => {
            owned_child::kill_and_wait(&mut child);
            return Err(CaptureError::PermissionDenied(
                "interaction access was not authorized".into(),
            ));
        }
        Err(error) => {
            owned_child::kill_and_wait(&mut child);
            return Err(CaptureError::Backend(format!(
                "input helper readiness failed: {error}"
            )));
        }
        Ok(_) => {}
    }
    // The sealed memfd must outlive Polkit authentication and the helper's
    // exec. A readiness line proves the privileged process has started.
    drop(helper);
    let ready: serde_json::Value = match serde_json::from_str(&ready_line) {
        Ok(ready) => ready,
        Err(error) => {
            owned_child::kill_and_wait(&mut child);
            return Err(error.into());
        }
    };
    if ready.get("event").and_then(serde_json::Value::as_str) != Some("ready") {
        owned_child::kill_and_wait(&mut child);
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
    let reader_thread = std::thread::Builder::new()
        .name("beam-linux-input-broker".into())
        .spawn(move || {
            for line in reader.lines().map_while(Result::ok) {
                let Ok(event) = serde_json::from_str::<NativeInputEvent>(&line) else {
                    continue;
                };
                if let Ok(mut subscribers) = shared.subscribers.lock() {
                    subscribers.retain(|subscriber| {
                        let Some(queue) = subscriber.upgrade() else {
                            return false;
                        };
                        if let Ok(mut queue) = queue.lock() {
                            queue.push(event.clone());
                        }
                        true
                    });
                }
            }
            shared.ready.store(false, Ordering::Release);
            if let Ok(mut subscribers) = shared.subscribers.lock() {
                subscribers.clear();
            }
        });
    let reader_thread = match reader_thread {
        Ok(reader_thread) => reader_thread,
        Err(error) => {
            broker.shared.ready.store(false, Ordering::Release);
            owned_child::kill_and_wait(&mut child);
            return Err(CaptureError::Backend(format!(
                "input broker reader failed to start: {error}"
            )));
        }
    };
    broker.reader = Some(reader_thread);
    broker.child = Some(child);
    Ok(linux_input_access_status_from(&broker))
}

impl InputEventQueue {
    pub(super) fn push(&mut self, event: NativeInputEvent) {
        if !self.accepting {
            return;
        }
        if self.events.len() < INPUT_QUEUE_CAPACITY {
            self.events.push_back(event);
            return;
        }
        if let NativeInputEvent::MouseMotion {
            monotonic_ns,
            delta_x,
            delta_y,
        } = &event
            && let Some(NativeInputEvent::MouseMotion {
                monotonic_ns: previous_ns,
                delta_x: previous_x,
                delta_y: previous_y,
            }) = self.events.back_mut()
        {
            *previous_ns = *monotonic_ns;
            *previous_x = previous_x.saturating_add(*delta_x);
            *previous_y = previous_y.saturating_add(*delta_y);
            return;
        }
        if let Some(index) = self
            .events
            .iter()
            .position(|queued| matches!(queued, NativeInputEvent::MouseMotion { .. }))
        {
            self.events.remove(index);
        } else {
            self.events.pop_front();
        }
        self.events.push_back(event);
    }
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
            owned_child::kill_and_wait(&mut child);
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

fn helper_launch() -> Result<(ElevatedHelperExecutable, &'static str), CaptureError> {
    let installed = PathBuf::from(INSTALLED_HELPER);
    if let Some(bundled) = bundled_input_helper_path()
        && bundled != installed
        && (!executable_file(&installed) || helper_version(&bundled) != helper_version(&installed))
    {
        // AppImage resources live on a user-mounted FUSE filesystem that the
        // privileged pkexec child cannot traverse. Copy it into an immutable,
        // sealed memory file that remains open until pkexec starts the helper.
        return Ok((
            ElevatedHelperExecutable::from_bundled(&bundled)?,
            "install-stream",
        ));
    }
    executable_file(&installed)
        .then_some((ElevatedHelperExecutable::installed(installed), "stream"))
        .ok_or_else(|| CaptureError::Unsupported("Beam input helper is not installed".into()))
}

impl ElevatedHelperExecutable {
    fn installed(path: PathBuf) -> Self {
        Self {
            path,
            _sealed_file: None,
        }
    }

    pub(super) fn from_bundled(source: &Path) -> Result<Self, CaptureError> {
        let mut input = OpenOptions::new()
            .read(true)
            .custom_flags(libc::O_NOFOLLOW)
            .open(source)
            .map_err(|error| CaptureError::storage(source, error))?;
        if !input
            .metadata()
            .map_err(|error| CaptureError::storage(source, error))?
            .is_file()
        {
            return Err(CaptureError::InvalidConfiguration(format!(
                "input helper is not a regular file: {}",
                source.display()
            )));
        }

        // SAFETY: the C string is static and valid; memfd_create returns a new
        // owned descriptor or -1 without aliasing any Rust-managed resource.
        let descriptor = unsafe {
            libc::memfd_create(
                c"beam-input-helper".as_ptr(),
                libc::MFD_CLOEXEC | libc::MFD_ALLOW_SEALING,
            )
        };
        if descriptor < 0 {
            return Err(CaptureError::Backend(format!(
                "input helper memory file could not be created: {}",
                std::io::Error::last_os_error()
            )));
        }
        // SAFETY: descriptor was freshly returned by memfd_create and ownership
        // is transferred exactly once to File, which closes it on every exit.
        let mut sealed_file = unsafe { File::from_raw_fd(descriptor) };
        std::io::copy(&mut input, &mut sealed_file)
            .and_then(|_| sealed_file.sync_all())
            .map_err(|error| CaptureError::storage(source, error))?;
        // SAFETY: fchmod only mutates the mode of this owned descriptor.
        if unsafe { libc::fchmod(sealed_file.as_raw_fd(), 0o500) } != 0 {
            return Err(CaptureError::Backend(format!(
                "input helper memory permissions could not be set: {}",
                std::io::Error::last_os_error()
            )));
        }
        let seals =
            libc::F_SEAL_SEAL | libc::F_SEAL_SHRINK | libc::F_SEAL_GROW | libc::F_SEAL_WRITE;
        // SAFETY: fcntl applies immutable seals to this owned memfd descriptor.
        if unsafe { libc::fcntl(sealed_file.as_raw_fd(), libc::F_ADD_SEALS, seals) } != 0 {
            return Err(CaptureError::Backend(format!(
                "input helper memory file could not be sealed: {}",
                std::io::Error::last_os_error()
            )));
        }
        let path = PathBuf::from(format!(
            "/proc/{}/fd/{}",
            std::process::id(),
            sealed_file.as_raw_fd()
        ));
        Ok(Self {
            path,
            _sealed_file: Some(sealed_file),
        })
    }

    pub(super) fn path(&self) -> &Path {
        &self.path
    }
}

fn helper_version(path: &Path) -> Option<(String, u64)> {
    let mut command = Command::new(path);
    command.arg("version").stdin(Stdio::null());
    owned_child::configure(&mut command);
    let output = command.output().ok()?;
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
    fs::metadata(path)
        .is_ok_and(|metadata| metadata.is_file() && metadata.permissions().mode() & 0o111 != 0)
}

fn command_on_path(command: &str) -> bool {
    std::env::var_os("PATH").is_some_and(|value| {
        std::env::split_paths(&value).any(|directory| executable_file(&directory.join(command)))
    })
}
