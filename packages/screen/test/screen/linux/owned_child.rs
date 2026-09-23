#![cfg(test)]
#![allow(clippy::expect_used)]

use super::{
    configure, kill_and_wait, process_groups, register, terminate_all, test_lock, unregister,
};
use std::process::Command;

#[test]
fn configured_helper_is_isolated_and_removed_from_owned_process_groups() {
    let _lock = test_lock();
    let mut command = Command::new("sh");
    command.args(["-c", "sleep 30"]);
    configure(&mut command);
    let mut child = command.spawn().expect("owned helper");
    let pid = libc::pid_t::try_from(child.id()).expect("pid");
    let group = unsafe { libc::getpgid(pid) };
    register(&child);
    assert!(process_groups().lock().expect("groups").contains(&pid));
    kill_and_wait(&mut child);
    assert_eq!(group, pid);
    assert!(!process_groups().lock().expect("groups").contains(&pid));
    assert!(child.try_wait().expect("reaped child").is_some());
}

#[test]
fn duplicate_registration_and_repeated_unregistration_are_idempotent() {
    let _lock = test_lock();
    let mut command = Command::new("sh");
    command.args(["-c", "exit 0"]);
    configure(&mut command);
    let mut child = command.spawn().expect("short lived helper");
    let pid = libc::pid_t::try_from(child.id()).expect("pid");
    register(&child);
    register(&child);
    let count = process_groups()
        .lock()
        .expect("groups")
        .iter()
        .filter(|entry| **entry == pid)
        .count();
    assert_eq!(count, 1);
    unregister(&child);
    unregister(&child);
    assert!(!process_groups().lock().expect("groups").contains(&pid));
    child.wait().expect("reap helper");
}

#[test]
fn kill_and_wait_accepts_an_already_exited_child_and_empty_termination() {
    let _lock = test_lock();
    let mut command = Command::new("sh");
    command.args(["-c", "exit 0"]);
    configure(&mut command);
    let mut child = command.spawn().expect("short lived helper");
    child.wait().expect("child exits");
    register(&child);
    kill_and_wait(&mut child);
    assert!(child.try_wait().expect("reaped helper").is_some());
    terminate_all();
    assert!(
        !process_groups()
            .lock()
            .expect("groups")
            .contains(&libc::pid_t::try_from(child.id()).expect("pid"))
    );
}
