#[cfg(target_os = "linux")]
#[path = "beam_input_helper/motion.rs"]
mod input_motion;

#[cfg(target_os = "linux")]
mod linux {
    use std::{
        collections::{HashMap, HashSet},
        fs,
        io::{self, BufWriter, Write},
        os::unix::fs::PermissionsExt,
        path::{Path, PathBuf},
        thread,
        time::Duration,
    };

    use capture::input::{InputKey, InputModifier, NativeInputEvent};
    use evdev::{Device, EventSummary, KeyCode, SynchronizationCode};
    use serde::Serialize;

    use super::input_motion::MotionAccumulator;

    const POLL_INTERVAL: Duration = Duration::from_millis(4);
    const INSTALLED_HELPER: &str = "/usr/libexec/beam-input-helper";
    const INSTALLED_POLICY: &str = "/usr/share/polkit-1/actions/com.beam.input-monitor.policy";
    const POLICY_VERSION: u32 = 3;
    const POLICY: &str = include_str!("beam-input-helper.policy");

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct ProbeResult {
        ready: bool,
        mouse_devices: usize,
        keyboard_devices: usize,
        records_text: bool,
    }

    #[derive(Clone)]
    struct ActiveShortcut {
        modifiers: Vec<InputModifier>,
        key: InputKey,
    }

    #[derive(Default)]
    pub(super) struct InputFilter {
        modifiers: HashSet<InputModifier>,
        active_shortcuts: HashMap<KeyCode, ActiveShortcut>,
    }

    pub(crate) fn run() -> Result<(), Box<dyn std::error::Error>> {
        let mut arguments = std::env::args().skip(1);
        let command = arguments.next().unwrap_or_else(|| "probe".into());
        if arguments.next().is_some() {
            return Err("beam-input-helper accepts exactly one command".into());
        }
        match command.as_str() {
            "probe" => probe(),
            "stream" => stream(),
            "install" => install(),
            "uninstall" => uninstall(),
            "version" => write_json(&serde_json::json!({
                "version": env!("CARGO_PKG_VERSION"),
                "policyVersion": POLICY_VERSION
            })),
            _ => Err("unsupported beam-input-helper command".into()),
        }
    }

    fn probe() -> Result<(), Box<dyn std::error::Error>> {
        require_privileged()?;
        let devices = open_input_devices()?;
        let mouse_devices = devices
            .iter()
            .filter(|device| supports_mouse(device))
            .count();
        let keyboard_devices = devices
            .iter()
            .filter(|device| supports_shortcuts(device))
            .count();
        write_json(&ProbeResult {
            ready: mouse_devices > 0 || keyboard_devices > 0,
            mouse_devices,
            keyboard_devices,
            records_text: false,
        })
    }

    fn stream() -> Result<(), Box<dyn std::error::Error>> {
        require_privileged()?;
        let devices = open_input_devices()?
            .into_iter()
            .filter(|device| supports_mouse(device) || supports_shortcuts(device))
            .collect::<Vec<_>>();
        if devices.is_empty() {
            return Err("no mouse or keyboard input device is available".into());
        }
        let mouse_devices = devices
            .iter()
            .filter(|device| supports_mouse(device))
            .count();
        let keyboard_devices = devices
            .iter()
            .filter(|device| supports_shortcuts(device))
            .count();
        for device in &devices {
            device.set_nonblocking(true)?;
        }
        let mut devices = devices
            .into_iter()
            .map(|device| (device, MotionAccumulator::default()))
            .collect::<Vec<_>>();
        let mut filter = InputFilter::default();
        let stdout = io::stdout();
        let mut output = BufWriter::with_capacity(64 * 1024, stdout.lock());
        serde_json::to_writer(
            &mut output,
            &serde_json::json!({
                "event": "ready",
                "mouseDevices": mouse_devices,
                "keyboardDevices": keyboard_devices,
                "recordsText": false
            }),
        )?;
        output.write_all(b"\n")?;
        output.flush()?;
        loop {
            let mut emitted = false;
            for (device, motion) in &mut devices {
                match device.fetch_events() {
                    Ok(events) => {
                        for event in events {
                            match event.destructure() {
                                EventSummary::RelativeAxis(_, axis, value) => {
                                    motion.push(axis, value);
                                }
                                EventSummary::Key(_, key, value) => {
                                    if let Some(relative) = motion.take(monotonic_ns()?) {
                                        write_stream_event(&mut output, &relative)?;
                                        emitted = true;
                                    }
                                    if let Some(filtered) =
                                        filter.apply(key, value, monotonic_ns()?)
                                    {
                                        write_stream_event(&mut output, &filtered)?;
                                        emitted = true;
                                    }
                                }
                                EventSummary::Synchronization(
                                    _,
                                    SynchronizationCode::SYN_REPORT,
                                    _,
                                ) => {
                                    if let Some(relative) = motion.take(monotonic_ns()?) {
                                        write_stream_event(&mut output, &relative)?;
                                        emitted = true;
                                    }
                                }
                                EventSummary::Synchronization(
                                    _,
                                    SynchronizationCode::SYN_DROPPED,
                                    _,
                                ) => motion.reset(),
                                _ => {}
                            }
                        }
                    }
                    Err(error) if error.kind() == io::ErrorKind::WouldBlock => {}
                    Err(error) => return Err(error.into()),
                }
            }
            if emitted {
                output.flush()?;
            }
            if !emitted {
                thread::sleep(POLL_INTERVAL);
            }
        }
    }

    fn install() -> Result<(), Box<dyn std::error::Error>> {
        require_privileged()?;
        let source = std::env::current_exe()?;
        install_file(&source, Path::new(INSTALLED_HELPER), 0o755)?;
        install_bytes(POLICY.as_bytes(), Path::new(INSTALLED_POLICY), 0o644)?;
        write_json(&serde_json::json!({
            "installed": true,
            "version": env!("CARGO_PKG_VERSION"),
            "policyVersion": POLICY_VERSION
        }))
    }

    fn uninstall() -> Result<(), Box<dyn std::error::Error>> {
        require_privileged()?;
        for path in [INSTALLED_POLICY, INSTALLED_HELPER] {
            match fs::remove_file(path) {
                Ok(()) => {}
                Err(error) if error.kind() == io::ErrorKind::NotFound => {}
                Err(error) => return Err(error.into()),
            }
        }
        write_json(&serde_json::json!({ "installed": false }))
    }

    fn install_file(
        source: &Path,
        destination: &Path,
        mode: u32,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let bytes = fs::read(source)?;
        install_bytes(&bytes, destination, mode)
    }

    fn install_bytes(
        bytes: &[u8],
        destination: &Path,
        mode: u32,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let parent = destination
            .parent()
            .ok_or("system helper destination has no parent directory")?;
        fs::create_dir_all(parent)?;
        let temporary = parent.join(format!(
            ".{}.{}.tmp",
            destination
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("beam-input-helper"),
            std::process::id()
        ));
        fs::write(&temporary, bytes)?;
        fs::set_permissions(&temporary, fs::Permissions::from_mode(mode))?;
        fs::rename(temporary, destination)?;
        Ok(())
    }

    fn require_privileged() -> Result<(), Box<dyn std::error::Error>> {
        // SAFETY: geteuid has no preconditions and does not mutate process state.
        if unsafe { libc::geteuid() } != 0 {
            return Err("input monitoring requires Polkit authorization".into());
        }
        Ok(())
    }

    fn open_input_devices() -> Result<Vec<Device>, Box<dyn std::error::Error>> {
        let mut paths = fs::read_dir("/dev/input")?
            .filter_map(Result::ok)
            .map(|entry| entry.path())
            .filter(|path| {
                path.file_name()
                    .and_then(|name| name.to_str())
                    .is_some_and(|name| name.starts_with("event"))
            })
            .collect::<Vec<PathBuf>>();
        paths.sort();
        Ok(paths
            .into_iter()
            .filter_map(|path| Device::open(path).ok())
            .collect())
    }

    fn supports_mouse(device: &Device) -> bool {
        device
            .supported_keys()
            .is_some_and(|keys| keys.contains(KeyCode::BTN_LEFT))
    }

    fn supports_shortcuts(device: &Device) -> bool {
        device.supported_keys().is_some_and(|keys| {
            keys.contains(KeyCode::KEY_LEFTCTRL)
                || keys.contains(KeyCode::KEY_RIGHTCTRL)
                || keys.contains(KeyCode::KEY_LEFTALT)
                || keys.contains(KeyCode::KEY_RIGHTALT)
                || keys.contains(KeyCode::KEY_LEFTMETA)
                || keys.contains(KeyCode::KEY_RIGHTMETA)
        })
    }

    fn monotonic_ns() -> Result<u64, io::Error> {
        let mut timestamp = libc::timespec {
            tv_sec: 0,
            tv_nsec: 0,
        };
        // SAFETY: timestamp points to valid writable memory for the duration of the call.
        if unsafe { libc::clock_gettime(libc::CLOCK_MONOTONIC, &raw mut timestamp) } != 0 {
            return Err(io::Error::last_os_error());
        }
        let seconds = u64::try_from(timestamp.tv_sec).unwrap_or(0);
        let nanoseconds = u64::try_from(timestamp.tv_nsec).unwrap_or(0);
        Ok(seconds
            .saturating_mul(1_000_000_000)
            .saturating_add(nanoseconds))
    }

    fn write_json(value: &impl Serialize) -> Result<(), Box<dyn std::error::Error>> {
        let stdout = io::stdout();
        let mut output = stdout.lock();
        serde_json::to_writer(&mut output, value)?;
        output.write_all(b"\n")?;
        output.flush()?;
        Ok(())
    }

    fn write_stream_event(
        output: &mut impl Write,
        event: &NativeInputEvent,
    ) -> Result<(), Box<dyn std::error::Error>> {
        serde_json::to_writer(&mut *output, event)?;
        output.write_all(b"\n")?;
        Ok(())
    }

    impl InputFilter {
        pub(super) fn apply(
            &mut self,
            key: KeyCode,
            value: i32,
            monotonic_ns: u64,
        ) -> Option<NativeInputEvent> {
            if value == 2 {
                return None;
            }
            if let Some(button) = mouse_button(key) {
                return Some(NativeInputEvent::MouseButton {
                    monotonic_ns,
                    button,
                    pressed: value == 1,
                });
            }
            if let Some(modifier) = modifier(key) {
                if value == 1 {
                    self.modifiers.insert(modifier);
                } else if value == 0 {
                    self.modifiers.remove(&modifier);
                }
                return None;
            }
            if value == 0 {
                let active = self.active_shortcuts.remove(&key)?;
                return Some(NativeInputEvent::Shortcut {
                    monotonic_ns,
                    pressed: false,
                    modifiers: active.modifiers,
                    key: active.key,
                });
            }
            if value != 1 {
                return None;
            }
            let (input_key, printable) = input_key(key)?;
            if printable
                && !self.modifiers.contains(&InputModifier::Control)
                && !self.modifiers.contains(&InputModifier::Alt)
                && !self.modifiers.contains(&InputModifier::Meta)
            {
                return None;
            }
            let active = ActiveShortcut {
                modifiers: ordered_modifiers(&self.modifiers),
                key: input_key,
            };
            self.active_shortcuts.insert(key, active.clone());
            Some(NativeInputEvent::Shortcut {
                monotonic_ns,
                pressed: true,
                modifiers: active.modifiers,
                key: active.key,
            })
        }
    }

    fn mouse_button(key: KeyCode) -> Option<u8> {
        match key {
            KeyCode::BTN_LEFT => Some(1),
            KeyCode::BTN_RIGHT => Some(2),
            KeyCode::BTN_MIDDLE => Some(3),
            KeyCode::BTN_SIDE => Some(4),
            KeyCode::BTN_EXTRA => Some(5),
            _ => None,
        }
    }

    fn modifier(key: KeyCode) -> Option<InputModifier> {
        match key {
            KeyCode::KEY_LEFTCTRL | KeyCode::KEY_RIGHTCTRL => Some(InputModifier::Control),
            KeyCode::KEY_LEFTSHIFT | KeyCode::KEY_RIGHTSHIFT => Some(InputModifier::Shift),
            KeyCode::KEY_LEFTALT | KeyCode::KEY_RIGHTALT => Some(InputModifier::Alt),
            KeyCode::KEY_LEFTMETA | KeyCode::KEY_RIGHTMETA => Some(InputModifier::Meta),
            _ => None,
        }
    }

    fn ordered_modifiers(modifiers: &HashSet<InputModifier>) -> Vec<InputModifier> {
        [
            InputModifier::Control,
            InputModifier::Shift,
            InputModifier::Alt,
            InputModifier::Meta,
        ]
        .into_iter()
        .filter(|modifier| modifiers.contains(modifier))
        .collect()
    }

    fn input_key(key: KeyCode) -> Option<(InputKey, bool)> {
        let mapped = match key {
            KeyCode::KEY_A => (InputKey::A, true),
            KeyCode::KEY_B => (InputKey::B, true),
            KeyCode::KEY_C => (InputKey::C, true),
            KeyCode::KEY_D => (InputKey::D, true),
            KeyCode::KEY_E => (InputKey::E, true),
            KeyCode::KEY_F => (InputKey::F, true),
            KeyCode::KEY_G => (InputKey::G, true),
            KeyCode::KEY_H => (InputKey::H, true),
            KeyCode::KEY_I => (InputKey::I, true),
            KeyCode::KEY_J => (InputKey::J, true),
            KeyCode::KEY_K => (InputKey::K, true),
            KeyCode::KEY_L => (InputKey::L, true),
            KeyCode::KEY_M => (InputKey::M, true),
            KeyCode::KEY_N => (InputKey::N, true),
            KeyCode::KEY_O => (InputKey::O, true),
            KeyCode::KEY_P => (InputKey::P, true),
            KeyCode::KEY_Q => (InputKey::Q, true),
            KeyCode::KEY_R => (InputKey::R, true),
            KeyCode::KEY_S => (InputKey::S, true),
            KeyCode::KEY_T => (InputKey::T, true),
            KeyCode::KEY_U => (InputKey::U, true),
            KeyCode::KEY_V => (InputKey::V, true),
            KeyCode::KEY_W => (InputKey::W, true),
            KeyCode::KEY_X => (InputKey::X, true),
            KeyCode::KEY_Y => (InputKey::Y, true),
            KeyCode::KEY_Z => (InputKey::Z, true),
            KeyCode::KEY_0 => (InputKey::Digit0, true),
            KeyCode::KEY_1 => (InputKey::Digit1, true),
            KeyCode::KEY_2 => (InputKey::Digit2, true),
            KeyCode::KEY_3 => (InputKey::Digit3, true),
            KeyCode::KEY_4 => (InputKey::Digit4, true),
            KeyCode::KEY_5 => (InputKey::Digit5, true),
            KeyCode::KEY_6 => (InputKey::Digit6, true),
            KeyCode::KEY_7 => (InputKey::Digit7, true),
            KeyCode::KEY_8 => (InputKey::Digit8, true),
            KeyCode::KEY_9 => (InputKey::Digit9, true),
            KeyCode::KEY_UP => (InputKey::ArrowUp, false),
            KeyCode::KEY_DOWN => (InputKey::ArrowDown, false),
            KeyCode::KEY_LEFT => (InputKey::ArrowLeft, false),
            KeyCode::KEY_RIGHT => (InputKey::ArrowRight, false),
            KeyCode::KEY_ESC => (InputKey::Escape, false),
            KeyCode::KEY_ENTER => (InputKey::Enter, false),
            KeyCode::KEY_TAB => (InputKey::Tab, false),
            KeyCode::KEY_BACKSPACE => (InputKey::Backspace, false),
            KeyCode::KEY_DELETE => (InputKey::Delete, false),
            KeyCode::KEY_INSERT => (InputKey::Insert, false),
            KeyCode::KEY_HOME => (InputKey::Home, false),
            KeyCode::KEY_END => (InputKey::End, false),
            KeyCode::KEY_PAGEUP => (InputKey::PageUp, false),
            KeyCode::KEY_PAGEDOWN => (InputKey::PageDown, false),
            KeyCode::KEY_SPACE => (InputKey::Space, true),
            KeyCode::KEY_F1 => (InputKey::F1, false),
            KeyCode::KEY_F2 => (InputKey::F2, false),
            KeyCode::KEY_F3 => (InputKey::F3, false),
            KeyCode::KEY_F4 => (InputKey::F4, false),
            KeyCode::KEY_F5 => (InputKey::F5, false),
            KeyCode::KEY_F6 => (InputKey::F6, false),
            KeyCode::KEY_F7 => (InputKey::F7, false),
            KeyCode::KEY_F8 => (InputKey::F8, false),
            KeyCode::KEY_F9 => (InputKey::F9, false),
            KeyCode::KEY_F10 => (InputKey::F10, false),
            KeyCode::KEY_F11 => (InputKey::F11, false),
            KeyCode::KEY_F12 => (InputKey::F12, false),
            _ => return None,
        };
        Some(mapped)
    }
}

#[cfg(all(target_os = "linux", test))]
#[path = "beam_input_helper/filter_tests.rs"]
mod filter_tests;

#[cfg(target_os = "linux")]
fn main() -> Result<(), Box<dyn std::error::Error>> {
    linux::run()
}

#[cfg(not(target_os = "linux"))]
fn main() {
    use std::io::Write;

    let _ = std::io::stderr().write_all(b"beam-input-helper is only available on Linux\n");
}
