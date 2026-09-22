#![cfg(test)]
#![allow(clippy::expect_used)]

use std::{fs, os::unix::fs::PermissionsExt};

use super::{has_named_component, probe_ffmpeg_at, run, select_h264_encoder};

fn executable(name: &str) -> std::path::PathBuf {
    // Checked-in fixtures have no writable descriptors that concurrent
    // subprocesses could inherit and temporarily make non-executable.
    std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/ffmpeg")
        .join(name)
}

#[test]
fn encoder_selection_prefers_x264() {
    let output = " V....D libopenh264 OpenH264\n V....D libx264 H.264";
    assert_eq!(select_h264_encoder(output), Some("libx264"));
}

#[test]
fn encoder_selection_accepts_openh264() {
    assert_eq!(
        select_h264_encoder(" V....D libopenh264 OpenH264"),
        Some("libopenh264")
    );
}

#[test]
fn encoder_selection_rejects_similar_names() {
    assert_eq!(select_h264_encoder(" V..... libx264rgb H.264"), None);
}

#[test]
fn component_parser_matches_the_name_column_only() {
    assert!(has_named_component(
        "  E  mp4             MP4 (MPEG-4 Part 14)",
        "mp4"
    ));
    assert!(!has_named_component(" E mov MP4 muxer", "mp4"));
    assert!(!has_named_component("mp4", "mp4"));
}

#[test]
fn probe_accepts_ffmpeg_eight_output() {
    let path = executable("eight.sh");
    let capabilities = probe_ffmpeg_at(path).expect("Ubuntu FFmpeg 8 output");
    assert_eq!(capabilities.encoder.name, "libx264");
}

#[test]
fn probe_rejects_a_missing_executable() {
    let error = probe_ffmpeg_at("/definitely/missing/beam-ffmpeg".into())
        .expect_err("missing FFmpeg must fail");
    assert_eq!(error.code(), "ffmpeg-unavailable");
}

#[test]
fn probe_drains_large_output_before_waiting_for_exit() {
    let directory = tempfile::tempdir().expect("temporary FFmpeg directory");
    let path = directory.path().join("large-output.sh");
    fs::write(
        &path,
        "#!/bin/sh\nhead -c 262144 /dev/zero | tr '\\000' 'x'\nhead -c 262144 /dev/zero | tr '\\000' 'y' >&2\n",
    )
    .expect("write large-output FFmpeg fixture");
    let mut permissions = fs::metadata(&path)
        .expect("large-output fixture metadata")
        .permissions();
    permissions.set_mode(0o755);
    fs::set_permissions(&path, permissions).expect("make fixture executable");
    let output = run(&path, &[]).expect("output larger than both pipe buffers");
    assert_eq!(output.len(), 262144);
    assert!(output.bytes().all(|byte| byte == b'x'));
}

#[test]
fn probe_rejects_an_executable_that_is_not_ffmpeg() {
    let directory = tempfile::tempdir().expect("temporary FFmpeg directory");
    let path = directory.path().join("not-ffmpeg.sh");
    fs::write(&path, "#!/bin/sh\nprintf 'another program\\n'\n").expect("write not-FFmpeg fixture");
    let mut permissions = fs::metadata(&path)
        .expect("not-FFmpeg fixture metadata")
        .permissions();
    permissions.set_mode(0o755);
    fs::set_permissions(&path, permissions).expect("make fixture executable");
    let error = probe_ffmpeg_at(path).expect_err("invalid executable identity");
    assert!(
        error
            .to_string()
            .contains("did not identify itself as FFmpeg")
    );
}

#[test]
fn probe_accepts_openh264_and_the_mp4_muxer() {
    let path = executable("openh264.sh");
    let capabilities = probe_ffmpeg_at(path).expect("valid fake FFmpeg");
    assert_eq!(capabilities.encoder.name, "libopenh264");
    assert!(!capabilities.encoder.is_hardware());
}

#[test]
fn probe_rejects_ffmpeg_without_a_supported_encoder() {
    let path = executable("missing-encoder.sh");
    let error = probe_ffmpeg_at(path).expect_err("missing H.264 encoder must fail");
    assert_eq!(error.code(), "ffmpeg-encoder-unavailable", "{error}");
}

#[test]
fn probe_rejects_ffmpeg_without_the_mp4_muxer() {
    let path = executable("missing-muxer.sh");
    let error = probe_ffmpeg_at(path).expect_err("missing MP4 muxer must fail");
    assert_eq!(error.code(), "ffmpeg-unavailable");
}
