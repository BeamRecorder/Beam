#![cfg(test)]
#![allow(clippy::expect_used)]

use super::*;

fn config<'a>(capabilities: &'a FfmpegCapabilities, output: &'a Path) -> FfmpegProcessConfig<'a> {
    FfmpegProcessConfig {
        capabilities,
        output,
        width: 2,
        height: 2,
        fps: 30,
        bitrate_bps: 1_000_000,
        keyframe_interval_seconds: 1,
    }
}

#[test]
fn spawn_rejects_each_zero_encoding_dimension_before_process_creation() {
    let temporary = tempfile::tempdir().expect("temporary output");
    let output = temporary.path().join("segment.mp4");
    let capabilities = FfmpegCapabilities {
        executable: temporary.path().join("does-not-exist"),
        encoder: FfmpegEncoder::software("libopenh264"),
    };
    for field in 0..5 {
        let mut request = config(&capabilities, &output);
        match field {
            0 => request.width = 0,
            1 => request.height = 0,
            2 => request.fps = 0,
            3 => request.bitrate_bps = 0,
            _ => request.keyframe_interval_seconds = 0,
        }
        let error = FfmpegProcess::spawn(request)
            .err()
            .expect("invalid configuration");
        assert_eq!(error.code(), "invalid-configuration");
    }
    assert!(!output.exists());
}

#[test]
fn spawn_refuses_existing_final_and_partial_paths() {
    let _lock = owned_child::test_lock();
    let temporary = tempfile::tempdir().expect("temporary output");
    let capabilities = FfmpegCapabilities {
        executable: temporary.path().join("missing-ffmpeg"),
        encoder: FfmpegEncoder::software("libopenh264"),
    };
    let output = temporary.path().join("segment.mp4");
    let partial = partial_path(&output).expect("partial path");
    for existing in [&output, &partial] {
        fs::write(existing, b"preserve").expect("write existing output");
        let error = FfmpegProcess::spawn(config(&capabilities, &output))
            .err()
            .expect("existing output");
        assert_eq!(error.code(), "ffmpeg-output-invalid");
        assert_eq!(fs::read(existing).expect("existing content"), b"preserve");
        fs::remove_file(existing).expect("remove fixture output");
    }
}

#[test]
fn spawn_reports_missing_executable_after_creating_output_directory() {
    let _lock = owned_child::test_lock();
    let temporary = tempfile::tempdir().expect("temporary output");
    let output = temporary.path().join("nested").join("segment.mp4");
    let capabilities = FfmpegCapabilities {
        executable: temporary.path().join("missing-ffmpeg"),
        encoder: FfmpegEncoder::software("libopenh264"),
    };
    let error = FfmpegProcess::spawn(config(&capabilities, &output))
        .err()
        .expect("missing executable");
    assert_eq!(error.code(), "ffmpeg-unavailable");
    assert!(output.parent().expect("output parent").is_dir());
    assert!(!partial_path(&output).expect("partial path").exists());
}

#[test]
fn spawn_reports_output_parent_that_is_a_regular_file() {
    let _lock = owned_child::test_lock();
    let temporary = tempfile::tempdir().expect("temporary output");
    let blocking_file = temporary.path().join("not-a-directory");
    fs::write(&blocking_file, b"occupied").expect("blocking file");
    let output = blocking_file.join("segment.mp4");
    let capabilities = capabilities();
    let error = FfmpegProcess::spawn(config(&capabilities, &output))
        .err()
        .expect("invalid parent");
    assert_eq!(error.code(), "storage-error");
    assert_eq!(
        fs::read(blocking_file).expect("preserved file"),
        b"occupied"
    );
}

#[test]
fn frame_layout_rejects_short_stride_and_truncated_buffer_before_writing() {
    let _lock = owned_child::test_lock();
    let (_fake, capabilities) = fake_ffmpeg(
        "#!/bin/sh\nfor output do :; done\nwc -c >/dev/null\nprintf data > \"$output\"\n",
    );
    let temporary = tempfile::tempdir().expect("temporary output");
    let output = temporary.path().join("segment.mp4");
    let mut process =
        FfmpegProcess::spawn(config(&capabilities, &output)).expect("spawn fake FFmpeg");
    for invalid in [frame(7, vec![0; 14]), frame(8, vec![0; 15])] {
        let error = process
            .write_frame(&invalid)
            .expect_err("invalid frame layout");
        assert_eq!(error.code(), "ffmpeg-failed");
        assert!(error.to_string().contains("invalid BGRA frame layout"));
    }
    drop(process);
    assert!(!output.exists());
}

#[test]
fn successful_child_that_writes_empty_output_is_rejected_and_cleaned() {
    let _lock = owned_child::test_lock();
    let (_fake, capabilities) =
        fake_ffmpeg("#!/bin/sh\nfor output do :; done\nwc -c >/dev/null\n: > \"$output\"\n");
    let temporary = tempfile::tempdir().expect("temporary output");
    let output = temporary.path().join("segment.mp4");
    let mut process =
        FfmpegProcess::spawn(config(&capabilities, &output)).expect("spawn fake FFmpeg");
    process
        .write_frame(&frame(8, vec![0; 16]))
        .expect("send frame");
    let error = process.finish().expect_err("empty segment");
    assert_eq!(error.code(), "ffmpeg-output-invalid");
    assert!(error.to_string().contains("empty MP4 segment"));
    assert!(!output.exists());
    assert!(!partial_path(&output).expect("partial path").exists());
}

#[test]
fn child_that_closes_stdin_reports_write_failure_for_large_frame() {
    let _lock = owned_child::test_lock();
    let (_fake, capabilities) = fake_ffmpeg("#!/bin/sh\nexit 0\n");
    let temporary = tempfile::tempdir().expect("temporary output");
    let output = temporary.path().join("segment.mp4");
    let mut request = config(&capabilities, &output);
    request.width = 1024;
    request.height = 1024;
    let mut process = FfmpegProcess::spawn(request).expect("spawn fake FFmpeg");
    let frame = OwnedVideoFrame {
        width: 1024,
        height: 1024,
        stride: 4096,
        pixel_format: PixelFormat::Bgra8,
        pixels: Arc::from(vec![0; 4 * 1024 * 1024]),
    };
    let error = process.write_frame(&frame).expect_err("closed FFmpeg pipe");
    assert_eq!(error.code(), "ffmpeg-failed");
    assert!(error.to_string().contains("failed to write"));
    drop(process);
    assert!(!output.exists());
}

#[test]
fn failure_stderr_keeps_only_the_last_64_kib() {
    let _lock = owned_child::test_lock();
    let (_fake, capabilities) = fake_ffmpeg(
        "#!/bin/sh\nfor output do :; done\nwc -c >/dev/null\nhead -c 70000 /dev/zero | tr '\\000' x >&2\nprintf 'TAIL-MARKER' >&2\nexit 7\n",
    );
    let temporary = tempfile::tempdir().expect("temporary output");
    let output = temporary.path().join("segment.mp4");
    let mut process =
        FfmpegProcess::spawn(config(&capabilities, &output)).expect("spawn fake FFmpeg");
    process
        .write_frame(&frame(8, vec![0; 16]))
        .expect("send frame");
    let error = process.finish().expect_err("nonzero FFmpeg exit");
    let message = error.to_string();
    assert_eq!(error.code(), "ffmpeg-failed");
    assert!(message.contains("TAIL-MARKER"));
    assert!(message.len() < 66_000);
}

#[test]
fn successful_child_without_output_reports_missing_partial_file() {
    let _lock = owned_child::test_lock();
    let (_fake, capabilities) = fake_ffmpeg("#!/bin/sh\nwc -c >/dev/null\nexit 0\n");
    let temporary = tempfile::tempdir().expect("temporary output");
    let output = temporary.path().join("segment.mp4");
    let mut process =
        FfmpegProcess::spawn(config(&capabilities, &output)).expect("spawn fake FFmpeg");
    process
        .write_frame(&frame(8, vec![0; 16]))
        .expect("send frame");
    let error = process.finish().expect_err("missing MP4 output");
    assert_eq!(error.code(), "storage-error");
    assert!(!output.exists());
}

#[test]
fn keyframe_interval_multiplication_saturates_at_u32_max() {
    let capabilities = capabilities();
    let mut request = config(&capabilities, Path::new("segment.mp4"));
    request.fps = u32::MAX;
    request.keyframe_interval_seconds = u8::MAX;
    let values = arguments(&request, Path::new("segment.partial.mp4"));
    assert!(values.windows(2).any(|pair| pair == ["-g", "4294967295"]));
}
