//! Independent parent-death protection for the capture engine.
//!
//! Electron lifecycle hooks cannot run after `kill -9`, `TerminateProcess`, a
//! native crash, or a main thread stuck before its hooks. The engine therefore
//! arms an OS-level parent-death guard at startup and, on supported platforms,
//! runs a watchdog thread that is independent of the command loop so a capture
//! command blocked in a native call cannot prevent termination.
//!
//! The guard never trusts a reusable PID alone: Windows opens the exact parent
//! process object, while Linux and macOS close the arm/check race explicitly.

use crate::CaptureError;

#[cfg(windows)]
mod win;

/// Environment variable carrying the owning Electron main process PID.
pub const PARENT_PID_ENV: &str = "BEAM_PARENT_PID";
/// Grace period after parent death before the watchdog force-exits the engine,
/// giving the command loop a chance to shut down cooperatively first.
pub const FORCED_EXIT_DEADLINE_MS: u64 = 3_000;

/// Install the platform parent-death guard and spawn the watchdog thread.
///
/// Returns `Ok` when the guard is active, or when no owner PID was provided
/// (a direct engine invocation falls back to stdin EOF). Returns an error when
/// a guard is required but cannot be established, so startup fails closed
/// rather than running without parent ownership.
pub fn install_parent_death_guard() -> Result<(), CaptureError> {
    #[cfg(target_os = "linux")]
    return linux::install();

    #[cfg(windows)]
    return win::install();

    #[cfg(target_os = "macos")]
    return macos::install();

    #[allow(unreachable_code)]
    Ok(())
}

/// Whether the parent-death signal has been observed, so the command loop can
/// shut down cooperatively between requests.
#[must_use]
pub fn parent_death_requested() -> bool {
    #[cfg(target_os = "linux")]
    return linux::parent_died();

    #[cfg(windows)]
    return win::parent_died();

    #[cfg(target_os = "macos")]
    return macos::parent_died();

    #[cfg(not(any(target_os = "linux", windows, target_os = "macos")))]
    return false;
}

#[cfg(target_os = "macos")]
mod macos {
    use std::sync::atomic::{AtomicBool, Ordering};

    use super::{FORCED_EXIT_DEADLINE_MS, parent_pid_from_env};
    use crate::CaptureError;

    static PARENT_DIED: AtomicBool = AtomicBool::new(false);

    #[must_use]
    pub(super) fn parent_died() -> bool {
        PARENT_DIED.load(Ordering::SeqCst)
    }

    pub(super) fn install() -> Result<(), CaptureError> {
        let Some(parent_pid) = parent_pid_from_env() else {
            return Ok(());
        };
        let recorded_parent = libc::pid_t::try_from(parent_pid).unwrap_or(-1);
        if unsafe { libc::getppid() } != recorded_parent {
            PARENT_DIED.store(true, Ordering::SeqCst);
        }
        std::thread::Builder::new()
            .name("capture-parent-watchdog".to_owned())
            .spawn(move || watch(recorded_parent))
            .map_err(|_| {
                CaptureError::parent_death_unavailable("failed to spawn the watchdog thread")
            })?;
        Ok(())
    }

    fn watch(parent: libc::pid_t) {
        if !parent_died() {
            let queue = unsafe { libc::kqueue() };
            if queue < 0 {
                unsafe { libc::_exit(1) };
            }
            let change = libc::kevent {
                ident: parent as libc::uintptr_t,
                filter: libc::EVFILT_PROC,
                flags: libc::EV_ADD | libc::EV_ENABLE | libc::EV_ONESHOT,
                fflags: libc::NOTE_EXIT,
                data: 0,
                udata: std::ptr::null_mut(),
            };
            let mut event: libc::kevent = unsafe { std::mem::zeroed() };
            let observed =
                unsafe { libc::kevent(queue, &change, 1, &mut event, 1, std::ptr::null()) };
            unsafe { libc::close(queue) };
            if observed <= 0 {
                unsafe { libc::_exit(1) };
            }
            PARENT_DIED.store(true, Ordering::SeqCst);
        }
        std::thread::sleep(std::time::Duration::from_millis(FORCED_EXIT_DEADLINE_MS));
        unsafe { libc::_exit(1) };
    }
}

#[must_use]
pub fn parent_pid_from_env() -> Option<u32> {
    std::env::var(PARENT_PID_ENV)
        .ok()
        .and_then(|value| value.parse::<u32>().ok())
}

#[cfg(target_os = "linux")]
mod linux {
    use std::sync::atomic::{AtomicBool, Ordering};

    use super::{FORCED_EXIT_DEADLINE_MS, parent_pid_from_env};
    use crate::CaptureError;

    static PARENT_DIED: AtomicBool = AtomicBool::new(false);

    /// Parent-death signal handler. Only stores an async-signal-safe atomic; all
    /// work happens on the watchdog thread or in the command loop.
    extern "C" fn on_parent_death(_signal: libc::c_int) {
        PARENT_DIED.store(true, Ordering::SeqCst);
    }

    #[must_use]
    pub(super) fn parent_died() -> bool {
        PARENT_DIED.load(Ordering::SeqCst)
    }

    pub(super) fn install() -> Result<(), CaptureError> {
        let Some(parent_pid) = parent_pid_from_env() else {
            return Ok(());
        };

        let mut action: libc::sigaction = unsafe { std::mem::zeroed() };
        action.sa_sigaction = on_parent_death as *const () as usize;
        unsafe { libc::sigemptyset(&mut action.sa_mask) };
        // No SA_RESTART: the death signal must surface through a blocking
        // command syscall so the cooperative path can observe it promptly.
        action.sa_flags = 0;
        if unsafe { libc::sigaction(libc::SIGTERM, &action, std::ptr::null_mut()) } != 0 {
            return Err(CaptureError::parent_death_unavailable(
                "failed to install the SIGTERM handler",
            ));
        }

        // Arm the kernel parent-death relationship: the kernel delivers SIGTERM
        // when the forking parent thread dies.
        if unsafe { libc::prctl(libc::PR_SET_PDEATHSIG, libc::SIGTERM) } != 0 {
            return Err(CaptureError::parent_death_unavailable(
                "PR_SET_PDEATHSIG failed",
            ));
        }

        // Close the fork/exec race: if the owner died before the signal was
        // armed, the kernel already reparented us and getppid() differs.
        let recorded_parent = libc::pid_t::try_from(parent_pid).unwrap_or(-1);
        if unsafe { libc::getppid() } != recorded_parent {
            unsafe { libc::raise(libc::SIGTERM) };
            return Ok(());
        }

        std::thread::Builder::new()
            .name("capture-parent-watchdog".to_owned())
            .spawn(move || {
                while !parent_died() {
                    std::thread::sleep(std::time::Duration::from_millis(100));
                }
                crate::screen::linux::terminate_owned_descendants();
                // Cooperative shutdown first: the command loop checks
                // `parent_death_requested()` between requests. If it is blocked
                // in a native call it cannot respond, so force-exit after the
                // crash deadline.
                std::thread::sleep(std::time::Duration::from_millis(FORCED_EXIT_DEADLINE_MS));
                crate::screen::linux::terminate_owned_descendants();
                std::process::exit(1);
            })
            .map_err(|_| {
                CaptureError::parent_death_unavailable("failed to spawn the watchdog thread")
            })?;

        Ok(())
    }
}
