#![allow(clippy::expect_used)]

use std::{
    fs,
    os::unix::fs::{PermissionsExt, symlink},
    path::Path,
    process::Command,
    time::SystemTime,
};

use super::input_helper_executable::helper_needs_install;

const COMPARISON_CHUNK_SIZE: usize = 16 * 1024;
const CURRENT_POLICY: &[u8] = include_bytes!("../../bin/beam-input-helper.policy");

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
