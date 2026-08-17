use std::{
    io,
    os::unix::process::CommandExt,
    process::{Child, Command},
    sync::{Mutex, OnceLock},
};

fn process_groups() -> &'static Mutex<Vec<libc::pid_t>> {
    static GROUPS: OnceLock<Mutex<Vec<libc::pid_t>>> = OnceLock::new();
    GROUPS.get_or_init(|| Mutex::new(Vec::new()))
}

#[cfg(test)]
pub(super) fn test_lock() -> std::sync::MutexGuard<'static, ()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
        .lock()
        .expect("owned child test lock")
}

/// Put a native helper in its own process group and bind it to the capture
/// engine. The parent check closes the fork/exec race after `PR_SET_PDEATHSIG`.
pub(super) fn configure(command: &mut Command) {
    let expected_parent = unsafe { libc::getpid() };
    unsafe {
        command.pre_exec(move || {
            if libc::setpgid(0, 0) != 0 {
                return Err(io::Error::last_os_error());
            }
            if libc::prctl(libc::PR_SET_PDEATHSIG, libc::SIGKILL) != 0 {
                return Err(io::Error::last_os_error());
            }
            if libc::getppid() != expected_parent {
                return Err(io::Error::new(
                    io::ErrorKind::BrokenPipe,
                    "capture parent exited",
                ));
            }
            Ok(())
        });
    }
}

pub(super) fn register(child: &Child) {
    if let Ok(pid) = libc::pid_t::try_from(child.id())
        && let Ok(mut groups) = process_groups().lock()
        && !groups.contains(&pid)
    {
        groups.push(pid);
    }
}

pub(super) fn unregister(child: &Child) {
    if let Ok(pid) = libc::pid_t::try_from(child.id())
        && let Ok(mut groups) = process_groups().lock()
    {
        groups.retain(|group| *group != pid);
    }
}

/// Called by the independent parent watchdog before it force-exits the engine.
pub(crate) fn terminate_all() {
    let groups = process_groups()
        .lock()
        .map_or_else(|_| Vec::new(), |groups| groups.clone());
    for group in groups {
        let _ = unsafe { libc::kill(-group, libc::SIGKILL) };
    }
}

/// Kill the complete owned process group, then reap the direct child.
pub(super) fn kill_and_wait(child: &mut Child) {
    if child.try_wait().ok().flatten().is_none()
        && let Ok(pid) = libc::pid_t::try_from(child.id())
    {
        let _ = unsafe { libc::kill(-pid, libc::SIGKILL) };
    }
    let _ = child.wait();
    unregister(child);
}
