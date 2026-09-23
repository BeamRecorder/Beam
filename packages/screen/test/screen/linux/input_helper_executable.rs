#![cfg(test)]
#![allow(clippy::expect_used)]

use std::{
    fs,
    os::{
        fd::AsRawFd,
        unix::fs::{PermissionsExt, symlink},
    },
    path::Path,
    process::Command,
    time::SystemTime,
};

use super::input_helper_executable::{
    ElevatedHelperExecutable, executable_file, helper_needs_install,
};

const COMPARISON_CHUNK_SIZE: usize = 16 * 1024;
const CURRENT_POLICY: &[u8] = include_bytes!("../../../src/bin/beam-input-helper.policy");

fn write_file(path: &Path, contents: &[u8]) {
    fs::write(path, contents).expect("write fixture");
}

fn write_executable(path: &Path, contents: &[u8]) {
    write_file(path, contents);
    let mut permissions = fs::metadata(path)
        .expect("read fixture metadata")
        .permissions();
    permissions.set_mode(0o755);
    fs::set_permissions(path, permissions).expect("make fixture executable");
}

fn write_current_policy(path: &Path) {
    write_file(path, CURRENT_POLICY);
}

fn helper_with_version_payload(payload_size: usize, payload_byte: u8) -> Vec<u8> {
    let header =
        b"#!/bin/sh\nif [ \"$1\" = version ]; then printf '0.1.0 policy-5\\n'; exit 0; fi\n#";
    let mut helper = vec![payload_byte; payload_size.max(header.len())];
    helper[..header.len()].copy_from_slice(header);
    helper
}

fn helper_with_path_dependent_version_payload(payload_size: usize) -> Vec<u8> {
    let header = b"#!/bin/sh\nif [ \"$1\" = version ]; then case \"$0\" in *bundle*) printf '{\"version\":\"bundled\",\"policyVersion\":5}\\n';; *) printf '{\"version\":\"installed\",\"policyVersion\":5}\\n';; esac; fi\n#";
    let mut helper = vec![b'x'; payload_size.max(header.len())];
    helper[..header.len()].copy_from_slice(header);
    helper
}

#[test]
fn identical_helper_bytes_and_policy_do_not_require_installation() {
    let temporary = tempfile::tempdir().expect("temporary helper directory");
    let bundled = temporary.path().join("bundle-helper-v-current");
    let installed = temporary.path().join("installed-helper-v-previous");
    let installed_policy = temporary.path().join("installed-policy.xml");
    let contents = helper_with_path_dependent_version_payload(COMPARISON_CHUNK_SIZE * 2 + 11);
    write_executable(&bundled, &contents);
    write_executable(&installed, &contents);
    write_current_policy(&installed_policy);

    let bundled_version = Command::new(&bundled)
        .arg("version")
        .output()
        .expect("run bundled fixture version command");
    let installed_version = Command::new(&installed)
        .arg("version")
        .output()
        .expect("run installed fixture version command");
    assert!(bundled_version.status.success());
    assert!(installed_version.status.success());
    assert_ne!(bundled_version.stdout, installed_version.stdout);

    fs::File::options()
        .write(true)
        .open(&installed)
        .expect("open installed helper")
        .set_times(fs::FileTimes::new().set_modified(SystemTime::UNIX_EPOCH))
        .expect("set old installed helper timestamp");
    assert_ne!(
        fs::metadata(&bundled)
            .expect("read bundled helper metadata")
            .modified()
            .expect("read bundled helper timestamp"),
        fs::metadata(&installed)
            .expect("read installed helper metadata")
            .modified()
            .expect("read installed helper timestamp")
    );

    assert!(
        !helper_needs_install(&bundled, &installed, &installed_policy)
            .expect("compare unchanged helper and policy")
    );
}

#[test]
fn changed_bytes_after_the_first_chunk_require_installation_even_at_same_length() {
    let temporary = tempfile::tempdir().expect("temporary helper directory");
    let bundled = temporary.path().join("bundle-helper");
    let installed = temporary.path().join("installed-helper");
    let installed_policy = temporary.path().join("installed-policy.xml");
    let installed_bytes = helper_with_version_payload(COMPARISON_CHUNK_SIZE * 2 + 11, b'x');
    let mut bundled_bytes = installed_bytes.clone();
    bundled_bytes[COMPARISON_CHUNK_SIZE + 1] = b'y';
    assert_eq!(bundled_bytes.len(), installed_bytes.len());
    write_executable(&bundled, &bundled_bytes);
    write_executable(&installed, &installed_bytes);
    write_current_policy(&installed_policy);

    assert!(
        helper_needs_install(&bundled, &installed, &installed_policy)
            .expect("compare changed helper bytes")
    );
}

#[test]
fn helper_comparison_detects_a_truncated_final_chunk() {
    let temporary = tempfile::tempdir().expect("temporary helper directory");
    let bundled = temporary.path().join("bundle-helper");
    let installed = temporary.path().join("installed-helper");
    let installed_policy = temporary.path().join("installed-policy.xml");
    let bundled_bytes = vec![b'a'; COMPARISON_CHUNK_SIZE + 19];
    let installed_bytes = vec![b'a'; COMPARISON_CHUNK_SIZE + 18];
    write_executable(&bundled, &bundled_bytes);
    write_executable(&installed, &installed_bytes);
    write_current_policy(&installed_policy);

    assert!(
        helper_needs_install(&bundled, &installed, &installed_policy)
            .expect("compare helper lengths")
    );
}

#[test]
fn missing_installed_helper_requires_installation() {
    let temporary = tempfile::tempdir().expect("temporary helper directory");
    let bundled = temporary.path().join("bundle-helper");
    let installed = temporary.path().join("missing-installed-helper");
    let installed_policy = temporary.path().join("installed-policy.xml");
    write_executable(&bundled, b"bundled helper bytes");
    write_current_policy(&installed_policy);

    assert!(
        helper_needs_install(&bundled, &installed, &installed_policy)
            .expect("missing installed helper is an installation need")
    );
}

#[test]
fn missing_installed_policy_requires_installation() {
    let temporary = tempfile::tempdir().expect("temporary helper directory");
    let bundled = temporary.path().join("bundle-helper");
    let installed = temporary.path().join("installed-helper");
    let installed_policy = temporary.path().join("missing-policy.xml");
    write_executable(&bundled, b"matching helper bytes");
    write_executable(&installed, b"matching helper bytes");

    assert!(
        helper_needs_install(&bundled, &installed, &installed_policy)
            .expect("missing installed policy is an installation need")
    );
}

#[test]
fn changed_installed_policy_requires_installation() {
    let temporary = tempfile::tempdir().expect("temporary helper directory");
    let bundled = temporary.path().join("bundle-helper");
    let installed = temporary.path().join("installed-helper");
    let installed_policy = temporary.path().join("installed-policy.xml");
    write_executable(&bundled, b"matching helper bytes");
    write_executable(&installed, b"matching helper bytes");
    write_file(&installed_policy, b"older policy bytes");

    assert!(
        helper_needs_install(&bundled, &installed, &installed_policy)
            .expect("changed installed policy requires installation")
    );
}

#[test]
fn missing_bundled_helper_is_reported_as_an_error() {
    let temporary = tempfile::tempdir().expect("temporary helper directory");
    let bundled = temporary.path().join("missing-bundle-helper");
    let installed = temporary.path().join("installed-helper");
    let installed_policy = temporary.path().join("installed-policy.xml");
    write_executable(&installed, b"installed helper bytes");
    write_current_policy(&installed_policy);

    assert!(helper_needs_install(&bundled, &installed, &installed_policy).is_err());
}

#[test]
fn symlink_bundled_helper_is_rejected() {
    let temporary = tempfile::tempdir().expect("temporary helper directory");
    let target = temporary.path().join("real-helper");
    let bundled = temporary.path().join("bundle-helper-link");
    let installed = temporary.path().join("installed-helper");
    let installed_policy = temporary.path().join("installed-policy.xml");
    write_executable(&target, b"bundled helper bytes");
    write_executable(&installed, b"installed helper bytes");
    write_current_policy(&installed_policy);
    symlink(&target, &bundled).expect("create bundled helper symlink");

    assert!(helper_needs_install(&bundled, &installed, &installed_policy).is_err());
}

#[test]
fn nonregular_bundled_helper_is_rejected() {
    let temporary = tempfile::tempdir().expect("temporary helper directory");
    let bundled = temporary.path().join("bundle-helper-directory");
    let installed = temporary.path().join("installed-helper");
    let installed_policy = temporary.path().join("installed-policy.xml");
    fs::create_dir(&bundled).expect("create nonregular helper source");
    write_executable(&installed, b"installed helper bytes");
    write_current_policy(&installed_policy);

    assert!(helper_needs_install(&bundled, &installed, &installed_policy).is_err());
}

#[test]
fn installed_helper_without_execute_bit_requires_reinstallation() {
    let temporary = tempfile::tempdir().expect("temporary helper directory");
    let bundled = temporary.path().join("bundle-helper");
    let installed = temporary.path().join("installed-helper");
    let policy = temporary.path().join("installed-policy.xml");
    write_executable(&bundled, b"matching helper bytes");
    write_file(&installed, b"matching helper bytes");
    write_current_policy(&policy);

    assert!(!executable_file(&installed));
    assert!(helper_needs_install(&bundled, &installed, &policy).expect("compare permissions"));
}

#[test]
fn helper_detection_requires_regular_executable_file() {
    let temporary = tempfile::tempdir().expect("temporary helper directory");
    let missing = temporary.path().join("missing");
    let directory = temporary.path().join("directory");
    let plain = temporary.path().join("plain");
    let executable = temporary.path().join("executable");
    fs::create_dir(&directory).expect("create directory");
    write_file(&plain, b"plain");
    write_executable(&executable, b"executable");
    for path in [&missing, &directory, &plain] {
        assert!(!executable_file(path), "{}", path.display());
    }
    assert!(executable_file(&executable));
}

#[test]
fn installed_helper_symlink_is_rejected_without_following_it() {
    let temporary = tempfile::tempdir().expect("temporary helper directory");
    let bundled = temporary.path().join("bundle-helper");
    let target = temporary.path().join("real-installed-helper");
    let installed = temporary.path().join("installed-link");
    let policy = temporary.path().join("installed-policy.xml");
    write_executable(&bundled, b"same bytes");
    write_executable(&target, b"same bytes");
    symlink(&target, &installed).expect("link installed helper");
    write_current_policy(&policy);

    assert!(helper_needs_install(&bundled, &installed, &policy).is_err());
}

#[test]
fn policy_with_extra_bytes_or_a_symlink_requires_update_or_is_rejected() {
    let temporary = tempfile::tempdir().expect("temporary helper directory");
    let bundled = temporary.path().join("bundle-helper");
    let installed = temporary.path().join("installed-helper");
    let policy = temporary.path().join("installed-policy.xml");
    write_executable(&bundled, b"same bytes");
    write_executable(&installed, b"same bytes");
    let mut extra = CURRENT_POLICY.to_vec();
    extra.push(b'!');
    write_file(&policy, &extra);
    assert!(helper_needs_install(&bundled, &installed, &policy).expect("extra policy byte"));

    let target = temporary.path().join("real-policy.xml");
    write_current_policy(&target);
    fs::remove_file(&policy).expect("remove policy");
    symlink(&target, &policy).expect("link policy");
    assert!(helper_needs_install(&bundled, &installed, &policy).is_err());
}

#[test]
fn elevated_copy_is_sealed_and_keeps_original_bytes() {
    let temporary = tempfile::tempdir().expect("temporary helper directory");
    let bundled = temporary.path().join("bundle-helper");
    let contents = helper_with_version_payload(COMPARISON_CHUNK_SIZE + 37, b'z');
    write_executable(&bundled, &contents);
    let elevated = ElevatedHelperExecutable::from_bundled(&bundled).expect("seal helper copy");
    assert_eq!(
        fs::read(elevated.path()).expect("read sealed copy"),
        contents
    );
    assert!(executable_file(elevated.path()));
    let descriptor = fs::File::open(elevated.path()).expect("open sealed copy");
    let seals = unsafe { libc::fcntl(descriptor.as_raw_fd(), libc::F_GET_SEALS) };
    assert_eq!(
        seals & (libc::F_SEAL_SEAL | libc::F_SEAL_SHRINK | libc::F_SEAL_GROW | libc::F_SEAL_WRITE),
        libc::F_SEAL_SEAL | libc::F_SEAL_SHRINK | libc::F_SEAL_GROW | libc::F_SEAL_WRITE
    );
}
