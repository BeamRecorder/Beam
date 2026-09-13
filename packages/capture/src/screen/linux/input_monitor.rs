use std::{
    collections::VecDeque,
    io::{BufRead, BufReader},
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

use super::{
    input_helper_diagnostics::{HelperDiagnostics, startup_error},
    input_helper_executable::{command_on_path, helper_launch, input_helper_path},
    owned_child,
};

pub(super) const INPUT_QUEUE_CAPACITY: usize = 4_096;

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
    diagnostics: Option<HelperDiagnostics>,
    last_failure: Option<InputAccessStatus>,
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
    let Ok(mut broker) = broker().lock() else {
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
    if let Some(failure) = &broker.last_failure {
        return failure.clone();
    }
    if broker.diagnostics.is_some() {
        let exit = broker
            .child
            .as_mut()
            .and_then(|child| child.try_wait().ok().flatten());
        let exited = exit.is_some();
        let detail = if exit.is_some() {
            broker
                .diagnostics
                .take()
                .map_or_else(String::new, HelperDiagnostics::finish)
        } else {
            broker
                .diagnostics
                .as_ref()
                .map_or_else(String::new, HelperDiagnostics::snapshot)
        };
        let exit = exit.map_or_else(String::new, |status| format!(" ({status})"));
        let failure = InputAccessStatus::failed(&CaptureError::Backend(format!(
            "Input helper stopped{exit}. {detail}"
        )));
        if exited {
            broker.last_failure = Some(failure.clone());
        }
        return failure;
    }
    match helper_launch() {
        Ok((_, "install-stream")) => InputAccessStatus::installation_required(),
        Ok(_) => InputAccessStatus::required(),
        Err(error) => InputAccessStatus::failed(&error),
    }
}

pub fn request_linux_input_access() -> Result<InputAccessStatus, CaptureError> {
    if input_helper_path().is_none() || !command_on_path("pkexec") {
        return Ok(linux_input_access_status());
    }
    match try_request_linux_input_access() {
        Ok(status) => Ok(status),
        Err(CaptureError::Cancelled) => {
            if let Ok(mut broker) = broker().lock() {
                broker.last_failure = None;
            }
            Ok(linux_input_access_status())
        }
        Err(error) => {
            let status = InputAccessStatus::failed(&error);
            if let Ok(mut broker) = broker().lock() {
                broker.last_failure = Some(status.clone());
            }
            Ok(status)
        }
    }
}

fn try_request_linux_input_access() -> Result<InputAccessStatus, CaptureError> {
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
        .stderr(Stdio::piped());
    owned_child::configure(&mut command);
    let mut child = command
        .spawn()
        .map_err(|error| CaptureError::Backend(format!("input helper failed to start: {error}")))?;
    owned_child::register(&child);
    let Some(stderr) = child.stderr.take() else {
        owned_child::kill_and_wait(&mut child);
        return Err(CaptureError::Backend(
            "input helper stderr was unavailable".into(),
        ));
    };
    broker.diagnostics = match HelperDiagnostics::start(stderr) {
        Ok(diagnostics) => Some(diagnostics),
        Err(error) => {
            owned_child::kill_and_wait(&mut child);
            return Err(error);
        }
    };
    let Some(stdout) = child.stdout.take() else {
        return Err(failed_startup(
            &mut broker,
            &mut child,
            "Input helper stdout was unavailable.",
        ));
    };
    let mut reader = BufReader::new(stdout);
    let mut ready_line = String::new();
    match reader.read_line(&mut ready_line) {
        Ok(0) => return Err(failed_startup(&mut broker, &mut child, "")),
        Err(error) => {
            return Err(failed_startup(
                &mut broker,
                &mut child,
                &format!("Input helper readiness failed: {error}"),
            ));
        }
        Ok(_) => {}
    }
    // The sealed memfd must outlive Polkit authentication and the helper's
    // exec. A readiness line proves the privileged process has started.
    drop(helper);
    let ready: serde_json::Value = match serde_json::from_str(&ready_line) {
        Ok(ready) => ready,
        Err(error) => {
            return Err(failed_startup(
                &mut broker,
                &mut child,
                &format!("Invalid input helper readiness JSON: {error}"),
            ));
        }
    };
    if ready.get("event").and_then(serde_json::Value::as_str) != Some("ready") {
        return Err(failed_startup(
            &mut broker,
            &mut child,
            "Input helper returned an invalid readiness response.",
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
            return Err(failed_startup(
                &mut broker,
                &mut child,
                &format!("Input broker reader failed to start: {error}"),
            ));
        }
    };
    broker.reader = Some(reader_thread);
    broker.child = Some(child);
    Ok(linux_input_access_status_from(&broker))
}

fn failed_startup(broker: &mut LinuxInputBroker, child: &mut Child, context: &str) -> CaptureError {
    // Reap after terminating the owned process group; EOF alone does not prove process exit.
    owned_child::kill_and_wait(child);
    let exit = child.try_wait().ok().flatten();
    let stderr = broker
        .diagnostics
        .take()
        .map_or_else(String::new, HelperDiagnostics::finish);
    let detail = [context, stderr.as_str()]
        .into_iter()
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("\n");
    startup_error(exit, &detail)
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
        self.last_failure = None;
        if let Some(mut child) = self.child.take() {
            owned_child::kill_and_wait(&mut child);
        }
        if let Some(reader) = self.reader.take() {
            let _ = reader.join();
        }
        if let Some(diagnostics) = self.diagnostics.take() {
            diagnostics.finish();
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

#[cfg(test)]
#[path = "input_monitor_startup_tests.rs"]
mod startup_tests;
