#![allow(clippy::expect_used)]

use std::{
    fs,
    os::unix::fs::{PermissionsExt, symlink},
    path::Path,
    process::Command,
};

use crate::input::{InputKey, NativeInputEvent};

use super::input_monitor::{
    ElevatedHelperExecutable, INPUT_QUEUE_CAPACITY, InputEventQueue, parse_helper_version,
};

fn write_executable(path: &Path, contents: &[u8]) {
    fs::write(path, contents).expect("write helper fixture");
    let mut permissions = fs::metadata(path)
        .expect("helper fixture metadata")
        .permissions();
    permissions.set_mode(0o755);
    fs::set_permissions(path, permissions).expect("make helper fixture executable");
}

#[test]
fn from_bundled_preserves_exact_bytes_through_a_proc_fd_path() {
    let _lock = super::owned_child::test_lock();
    let temporary = tempfile::tempdir().expect("temporary helper directory");
    let source = temporary.path().join("beam-input-helper-from-appimage");
    let contents = b"appimage helper bytes\0with a non-text suffix";
    write_executable(&source, contents);

    let helper = ElevatedHelperExecutable::from_bundled(&source).expect("create helper");

    assert_ne!(helper.path(), source.as_path());
    assert!(helper.path().starts_with("/proc/"));
    assert!(helper.path().to_string_lossy().contains("/fd/"));
    assert_eq!(
        fs::read(helper.path()).expect("read helper through proc fd"),
        contents
    );
}

#[test]
fn from_bundled_rejects_a_symlink_source() {
    let _lock = super::owned_child::test_lock();
    let temporary = tempfile::tempdir().expect("temporary helper directory");
    let target = temporary.path().join("real-helper");
    write_executable(&target, b"real helper");
    let source_link = temporary.path().join("beam-input-helper-link");
    symlink(&target, &source_link).expect("create source symlink");

    assert!(ElevatedHelperExecutable::from_bundled(&source_link).is_err());
    assert!(
        fs::symlink_metadata(&source_link)
            .expect("source symlink metadata")
            .file_type()
            .is_symlink()
    );
}

#[test]
fn from_bundled_rejects_missing_and_non_regular_sources() {
    let _lock = super::owned_child::test_lock();
    let temporary = tempfile::tempdir().expect("temporary helper directory");
    let missing_source = temporary.path().join("missing-helper");
    assert!(ElevatedHelperExecutable::from_bundled(&missing_source).is_err());

    let source_directory = temporary.path().join("source-directory");
    fs::create_dir(&source_directory).expect("create source directory");
    assert!(ElevatedHelperExecutable::from_bundled(&source_directory).is_err());
}

#[test]
fn from_bundled_memfd_is_sealed_against_writes() {
    let _lock = super::owned_child::test_lock();
    let temporary = tempfile::tempdir().expect("temporary helper directory");
    let source = temporary.path().join("beam-input-helper-from-appimage");
    let contents = b"immutable helper payload";
    write_executable(&source, contents);

    let helper = ElevatedHelperExecutable::from_bundled(&source).expect("create helper");

    assert!(
        fs::OpenOptions::new()
            .write(true)
            .open(helper.path())
            .is_err()
    );
    assert_eq!(
        fs::read(helper.path()).expect("read sealed helper"),
        contents
    );
}

#[test]
fn from_bundled_memfd_remains_executable_through_its_proc_path() {
    let _lock = super::owned_child::test_lock();
    let temporary = tempfile::tempdir().expect("temporary helper directory");
    let source = temporary.path().join("beam-input-helper-from-appimage");
    write_executable(&source, b"#!/bin/sh\nexit 0\n");

    let helper = ElevatedHelperExecutable::from_bundled(&source).expect("create helper");
    let status = Command::new(helper.path())
        .status()
        .expect("execute helper through proc fd");

    assert!(status.success());
}

#[test]
fn from_bundled_path_becomes_invalid_after_owner_is_dropped() {
    let _lock = super::owned_child::test_lock();
    let temporary = tempfile::tempdir().expect("temporary helper directory");
    let source = temporary.path().join("beam-input-helper-from-appimage");
    write_executable(&source, b"helper that expires with its owner");
    let path = {
        let helper = ElevatedHelperExecutable::from_bundled(&source).expect("create helper");
        assert!(helper.path().starts_with("/proc/"));
        helper.path().to_owned()
    };

    assert!(!path.exists());
    assert!(fs::read(path).is_err());
}

#[test]
fn parses_current_helper_version_and_policy_revision() {
    let output = format!(
        r#"{{"version":"{}","policyVersion":5}}"#,
        env!("CARGO_PKG_VERSION")
    );

    assert_eq!(
        parse_helper_version(output.as_bytes()),
        Some((env!("CARGO_PKG_VERSION").to_owned(), 5))
    );
}

#[test]
fn rejects_helper_version_without_policy_revision() {
    assert_eq!(
        parse_helper_version(
            format!(r#"{{"version":"{}"}}"#, env!("CARGO_PKG_VERSION")).as_bytes()
        ),
        None
    );
}

#[test]
fn rejects_helper_version_with_incorrect_metadata_types() {
    assert_eq!(
        parse_helper_version(br#"{"version":"0.1.0","policyVersion":"2"}"#),
        None
    );
    assert_eq!(
        parse_helper_version(br#"{"version":1,"policyVersion":2}"#),
        None
    );
}

#[test]
fn rejects_invalid_helper_version_json() {
    assert_eq!(parse_helper_version(b"not json"), None);
}

#[test]
fn policy_revision_change_is_detected_even_when_package_version_matches() {
    let current = parse_helper_version(
        format!(
            r#"{{"version":"{}","policyVersion":5}}"#,
            env!("CARGO_PKG_VERSION")
        )
        .as_bytes(),
    )
    .expect("current helper metadata");
    let previous = parse_helper_version(
        format!(
            r#"{{"version":"{}","policyVersion":1}}"#,
            env!("CARGO_PKG_VERSION")
        )
        .as_bytes(),
    )
    .expect("previous helper metadata");

    assert_ne!(current, previous);
}

#[test]
fn full_input_queue_coalesces_adjacent_motion() {
    let mut queue = InputEventQueue::default();
    for monotonic_ns in 0..INPUT_QUEUE_CAPACITY as u64 {
        queue.push(NativeInputEvent::MouseMotion {
            monotonic_ns,
            delta_x: 1,
            delta_y: -1,
        });
    }
    queue.push(NativeInputEvent::MouseMotion {
        monotonic_ns: 9_999,
        delta_x: 4,
        delta_y: -3,
    });

    assert_eq!(queue.events.len(), INPUT_QUEUE_CAPACITY);
    assert!(matches!(
        queue.events.back(),
        Some(NativeInputEvent::MouseMotion {
            monotonic_ns: 9_999,
            delta_x: 5,
            delta_y: -4,
        })
    ));
}

#[test]
fn full_input_queue_preserves_a_button_by_discarding_motion_first() {
    let mut queue = InputEventQueue::default();
    for monotonic_ns in 0..INPUT_QUEUE_CAPACITY as u64 {
        queue.push(NativeInputEvent::MouseMotion {
            monotonic_ns,
            delta_x: 1,
            delta_y: 0,
        });
    }
    queue.push(NativeInputEvent::MouseButton {
        monotonic_ns: 10_000,
        button: 1,
        pressed: false,
    });

    assert_eq!(queue.events.len(), INPUT_QUEUE_CAPACITY);
    assert!(matches!(
        queue.events.back(),
        Some(NativeInputEvent::MouseButton {
            monotonic_ns: 10_000,
            pressed: false,
            ..
        })
    ));
}

#[test]
fn full_non_motion_queue_remains_bounded() {
    let mut queue = InputEventQueue::default();
    for monotonic_ns in 0..INPUT_QUEUE_CAPACITY as u64 {
        queue.push(NativeInputEvent::MouseButton {
            monotonic_ns,
            button: 1,
            pressed: true,
        });
    }
    queue.push(NativeInputEvent::Shortcut {
        monotonic_ns: 10_000,
        pressed: true,
        modifiers: Vec::new(),
        key: InputKey::Escape,
    });

    assert_eq!(queue.events.len(), INPUT_QUEUE_CAPACITY);
    assert!(matches!(
        queue.events.back(),
        Some(NativeInputEvent::Shortcut {
            key: InputKey::Escape,
            ..
        })
    ));
}

#[test]
fn stopped_input_queue_rejects_late_events_without_dropping_queued_events() {
    let mut queue = InputEventQueue::default();
    queue.push(NativeInputEvent::MouseButton {
        monotonic_ns: 10,
        button: 1,
        pressed: true,
    });
    queue.accepting = false;
    queue.push(NativeInputEvent::MouseButton {
        monotonic_ns: 20,
        button: 1,
        pressed: false,
    });

    assert_eq!(queue.events.len(), 1);
    assert!(matches!(
        queue.events.front(),
        Some(NativeInputEvent::MouseButton {
            monotonic_ns: 10,
            pressed: true,
            ..
        })
    ));
}
