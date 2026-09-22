#![allow(clippy::expect_used)]
#![cfg(target_os = "linux")]

use std::{env, process::Command};

use beam_media_core::AudioPacket;
use beam_media_encode::{AudioConfig, EncodeError, QueueLimits, TrackWriter};

const CHILD_ENV: &str = "BEAM_MEDIA_DISK_LIMIT_CHILD";
const MISSING_PLUGIN_CHILD_ENV: &str = "BEAM_MEDIA_MISSING_PLUGIN_CHILD";

#[test]
fn missing_directory_or_existing_track_never_overwrites_media() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let config = AudioConfig {
        sample_rate: 48_000,
        channels: 1,
    };
    let limits = QueueLimits {
        packets: 4,
        bytes: 64 * 1024,
    };
    let missing = temporary.path().join("absent").join("microphone.wav");
    assert!(matches!(
        TrackWriter::open_audio(&missing, config, limits),
        Err(EncodeError::Storage { .. })
    ));
    assert!(!missing.exists());

    let destination = temporary.path().join("microphone.wav");
    std::fs::write(&destination, b"existing media").expect("fixture");
    assert!(matches!(
        TrackWriter::open_audio(&destination, config, limits),
        Err(EncodeError::Storage { .. })
    ));
    assert_eq!(
        std::fs::read(&destination).expect("original media"),
        b"existing media"
    );

    std::fs::remove_file(&destination).expect("remove fixture");
    let partial = temporary.path().join("microphone.wav.part");
    std::fs::write(&partial, b"recoverable partial").expect("partial fixture");
    assert!(matches!(
        TrackWriter::open_audio(&destination, config, limits),
        Err(EncodeError::Storage { .. })
    ));
    assert_eq!(
        std::fs::read(&partial).expect("original partial"),
        b"recoverable partial"
    );
}

#[test]
fn disk_limit_reports_failed_track_without_publishing_a_wav() {
    let executable = env::current_exe().expect("test executable");
    let output = Command::new(executable)
        .args(["--exact", "disk_limit_child"])
        .env(CHILD_ENV, "1")
        .output()
        .expect("isolated disk limit process");
    assert!(
        output.status.success(),
        "child failed: {}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
}

#[test]
fn disk_limit_child() {
    if env::var_os(CHILD_ENV).is_none() {
        return;
    }
    let temporary = tempfile::tempdir().expect("tempdir");
    let destination = temporary.path().join("microphone.wav");
    let writer = TrackWriter::open_audio(
        &destination,
        AudioConfig {
            sample_rate: 48_000,
            channels: 1,
        },
        QueueLimits {
            packets: 4,
            bytes: 64 * 1024,
        },
    )
    .expect("audio writer");
    // Isolate the process: file-size limits and SIGXFSZ disposition are global.
    let original_limit = unsafe {
        libc::signal(libc::SIGXFSZ, libc::SIG_IGN);
        let mut original = libc::rlimit {
            rlim_cur: 0,
            rlim_max: 0,
        };
        assert_eq!(libc::getrlimit(libc::RLIMIT_FSIZE, &raw mut original), 0);
        let limit = libc::rlimit {
            rlim_cur: 4096,
            rlim_max: original.rlim_max,
        };
        assert_eq!(libc::setrlimit(libc::RLIMIT_FSIZE, &limit), 0);
        original
    };
    writer
        .push_audio(AudioPacket {
            start_ns: 0,
            sample_rate: 48_000,
            channels: 1,
            frames: 2048,
            data: vec![0.25; 2048],
        })
        .expect("bounded queue accepts packet");
    let result = writer.finish();
    unsafe {
        assert_eq!(
            libc::setrlimit(libc::RLIMIT_FSIZE, &raw const original_limit),
            0
        );
    }
    assert!(result.is_err(), "filesink must surface EFBIG");
    assert!(!destination.exists(), "failed WAV must remain unpublished");
    assert!(temporary.path().join("microphone.wav.part").exists());
}

#[test]
fn missing_plugin_reports_a_pipeline_error_without_publishing_a_wav() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let executable = env::current_exe().expect("test executable");
    let output = Command::new(executable)
        .args(["--exact", "missing_plugin_child"])
        .env(MISSING_PLUGIN_CHILD_ENV, "1")
        .env("GST_PLUGIN_SYSTEM_PATH_1_0", "")
        .env("GST_PLUGIN_PATH_1_0", "/nonexistent")
        .env("GST_REGISTRY", temporary.path().join("empty-registry.bin"))
        .output()
        .expect("isolated plugin registry process");
    assert!(
        output.status.success(),
        "child failed: {}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
}

#[test]
fn missing_plugin_child() {
    if env::var_os(MISSING_PLUGIN_CHILD_ENV).is_none() {
        return;
    }
    let temporary = tempfile::tempdir().expect("tempdir");
    let destination = temporary.path().join("microphone.wav");
    let result = TrackWriter::open_audio(
        &destination,
        AudioConfig {
            sample_rate: 48_000,
            channels: 1,
        },
        QueueLimits {
            packets: 4,
            bytes: 64 * 1024,
        },
    );
    assert!(matches!(
        result,
        Err(EncodeError::Pipeline(message)) if message.contains("appsrc")
    ));
    assert!(!destination.exists());
    assert!(!temporary.path().join("microphone.wav.part").exists());
}
