use std::{
    io,
    os::unix::process::CommandExt,
    process::{Child, Command, ExitStatus},
    sync::{Mutex, OnceLock},
    time::{Duration, Instant},
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
        .unwrap_or_else(std::sync::PoisonError::into_inner)
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

pub(super) fn wait_for_exit(child: &mut Child, timeout: Duration) -> io::Result<ExitStatus> {
    let deadline = Instant::now() + timeout;
    loop {
        if let Some(status) = child.try_wait()? {
            return Ok(status);
        }
        if Instant::now() >= deadline {
            kill_and_wait(child);
            return Err(io::Error::new(
                io::ErrorKind::TimedOut,
                "recording encoder did not finish before its shutdown deadline",
            ));
        }
        std::thread::sleep(Duration::from_millis(10));
    }
}

#[cfg(test)]
mod wait_tests {
    #![allow(clippy::expect_used)]
    use super::*;

    #[test]
    fn accepts_a_successfully_exited_encoder() {
        let _lock = test_lock();
        let mut child = Command::new("sh")
            .args(["-c", "exit 0"])
            .spawn()
            .expect("child");
        assert!(
            wait_for_exit(&mut child, Duration::from_secs(1))
                .expect("exit")
                .success()
        );
    }

    #[test]
    fn preserves_encoder_failure_exit_status() {
        let _lock = test_lock();
        let mut child = Command::new("sh")
            .args(["-c", "exit 7"])
            .spawn()
            .expect("child");
        assert_eq!(
            wait_for_exit(&mut child, Duration::from_secs(1))
                .expect("exit")
                .code(),
            Some(7)
        );
    }

    #[test]
    fn kills_and_reaps_an_encoder_that_never_finishes() {
        let _lock = test_lock();
        let mut command = Command::new("sleep");
        command.arg("30");
        configure(&mut command);
        let mut child = command.spawn().expect("child");
        register(&child);
        let started = Instant::now();
        let error = wait_for_exit(&mut child, Duration::from_millis(30)).expect_err("timeout");
        assert_eq!(error.kind(), io::ErrorKind::TimedOut);
        assert!(started.elapsed() < Duration::from_secs(1));
        assert!(child.try_wait().expect("reaped").is_some());
    }
}
