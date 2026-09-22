#![allow(clippy::expect_used)]

use beam_media_core::{AudioPacket, VideoFrame};
use beam_media_encode::{AudioConfig, EncodeError, QueueLimits, TrackWriter, VideoConfig};

const LIMITS: QueueLimits = QueueLimits {
    packets: 16,
    bytes: 1_048_576,
};

#[test]
fn synthetic_rgba_frames_produce_webm_only_after_eos() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let path = temporary.path().join("camera.webm");
    let config = VideoConfig {
        width: 16,
        height: 16,
        fps: 30,
    };
    let writer = TrackWriter::open_video(&path, config, LIMITS).expect("video pipeline");
    for index in 0..4_u64 {
        let mut rgba = vec![0_u8; 16 * 16 * 4];
        for pixel in rgba.chunks_exact_mut(4) {
            pixel.copy_from_slice(&[index as u8 * 40, 80, 120, 255]);
        }
        writer
            .push_video(
                VideoFrame {
                    captured_ns: index * 33_333_333,
                    width: 16,
                    height: 16,
                    data: rgba,
                },
                33_333_333,
            )
            .expect("frame");
    }
    assert_eq!(writer.accepted_packet_count(), 4);
    assert!(!path.exists());
    writer.finish().expect("EOS");
    let bytes = std::fs::read(&path).expect("WebM");
    assert!(bytes.len() > 100);
    assert_eq!(&bytes[..4], &[0x1a, 0x45, 0xdf, 0xa3]);
    assert!(!temporary.path().join("camera.webm.part").exists());
}

#[test]
fn two_audio_writers_publish_independent_wav_files() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let config = AudioConfig {
        sample_rate: 48_000,
        channels: 1,
    };
    let mic_path = temporary.path().join("microphone.wav");
    let system_path = temporary.path().join("system-audio.wav");
    let microphone = TrackWriter::open_audio(&mic_path, config, LIMITS).expect("mic pipeline");
    let system = TrackWriter::open_audio(&system_path, config, LIMITS).expect("system pipeline");
    for index in 0..5_u64 {
        for (writer, value) in [(&microphone, 0.25_f32), (&system, -0.25_f32)] {
            writer
                .push_audio(AudioPacket {
                    start_ns: index * 10_000_000,
                    sample_rate: 48_000,
                    channels: 1,
                    frames: 480,
                    data: vec![value; 480],
                })
                .expect("audio packet");
        }
    }
    assert_eq!(microphone.accepted_packet_count(), 5);
    assert_eq!(system.accepted_packet_count(), 5);
    microphone.finish().expect("mic EOS");
    system.finish().expect("system EOS");
    let mic = std::fs::read(mic_path).expect("mic WAV");
    let system = std::fs::read(system_path).expect("system WAV");
    assert_eq!(&mic[..4], b"RIFF");
    assert_eq!(&system[..4], b"RIFF");
    assert_eq!(wav_data_bytes(&mic), Some(5 * 480 * 4));
    assert_eq!(wav_data_bytes(&system), Some(5 * 480 * 4));
    assert_ne!(mic, system);
}

fn wav_data_bytes(file: &[u8]) -> Option<usize> {
    if file.get(..4)? != b"RIFF" || file.get(8..12)? != b"WAVE" {
        return None;
    }
    let mut offset = 12_usize;
    while offset.checked_add(8)? <= file.len() {
        let name = file.get(offset..offset + 4)?;
        let size = u32::from_le_bytes(file.get(offset + 4..offset + 8)?.try_into().ok()?) as usize;
        if name == b"data" {
            return Some(size);
        }
        offset = offset.checked_add(8 + size + (size % 2))?;
    }
    None
}

#[test]
fn invalid_format_and_queue_budget_fail_before_submission() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let path = temporary.path().join("camera.webm");
    let config = VideoConfig {
        width: 16,
        height: 16,
        fps: 30,
    };
    assert!(TrackWriter::open_video(&path, VideoConfig { fps: 0, ..config }, LIMITS).is_err());
    let writer = TrackWriter::open_video(
        &path,
        config,
        QueueLimits {
            packets: 1,
            bytes: 100,
        },
    )
    .expect("writer");
    let frame = VideoFrame {
        captured_ns: 0,
        width: 16,
        height: 16,
        data: vec![255; 16 * 16 * 4],
    };
    assert!(matches!(
        writer.push_video(frame, 33_333_333),
        Err(EncodeError::QueueFull { kind: "bytes" })
    ));
    assert_eq!(writer.accepted_packet_count(), 0);
    writer.finish().expect("empty EOS");
}

#[test]
fn timestamp_regression_and_malformed_frame_are_rejected() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let path = temporary.path().join("camera.webm");
    let writer = TrackWriter::open_video(
        &path,
        VideoConfig {
            width: 16,
            height: 16,
            fps: 30,
        },
        LIMITS,
    )
    .expect("writer");
    let make_frame = |captured_ns, length| VideoFrame {
        captured_ns,
        width: 16,
        height: 16,
        data: vec![255; length],
    };
    assert!(matches!(
        writer.push_video(make_frame(0, 1), 33_333_333),
        Err(EncodeError::InvalidFormat(_))
    ));
    writer
        .push_video(make_frame(100, 16 * 16 * 4), 33_333_333)
        .expect("first frame");
    assert!(matches!(
        writer.push_video(make_frame(50, 16 * 16 * 4), 33_333_333),
        Err(EncodeError::NonMonotonic { .. })
    ));
    writer.finish().expect("EOS");
}

#[test]
fn writer_rejects_wrong_track_kind_zero_duration_and_timestamp_overflow() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let video = TrackWriter::open_video(
        &temporary.path().join("camera.webm"),
        VideoConfig {
            width: 2,
            height: 2,
            fps: 30,
        },
        LIMITS,
    )
    .expect("video writer");
    let packet = |start_ns, sample_rate, frames| AudioPacket {
        start_ns,
        sample_rate,
        channels: 1,
        frames,
        data: vec![0.5; frames as usize],
    };
    assert!(matches!(
        video.push_audio(packet(0, 48_000, 1)),
        Err(EncodeError::InvalidFormat(_))
    ));
    let frame = VideoFrame {
        captured_ns: 0,
        width: 2,
        height: 2,
        data: vec![0; 16],
    };
    assert!(matches!(
        video.push_video(frame.clone(), 0),
        Err(EncodeError::InvalidFormat(_))
    ));
    assert!(matches!(
        video.push_video(
            VideoFrame {
                captured_ns: u64::MAX,
                ..frame.clone()
            },
            1
        ),
        Err(EncodeError::InvalidFormat(_))
    ));
    video.finish().expect("video EOS");

    let audio = TrackWriter::open_audio(
        &temporary.path().join("microphone.wav"),
        AudioConfig {
            sample_rate: 48_000,
            channels: 1,
        },
        LIMITS,
    )
    .expect("audio writer");
    assert!(matches!(
        audio.push_video(frame, 33_333_333),
        Err(EncodeError::InvalidFormat(_))
    ));
    assert!(matches!(
        audio.push_audio(packet(0, 48_000, 0)),
        Err(EncodeError::InvalidFormat(_))
    ));
    assert!(matches!(
        audio.push_audio(packet(0, 44_100, 1)),
        Err(EncodeError::InvalidFormat(_))
    ));
    assert!(matches!(
        audio.push_audio(packet(u64::MAX, 48_000, 1)),
        Err(EncodeError::InvalidFormat(_))
    ));
    audio
        .push_audio(packet(0, 48_000, 1))
        .expect("first packet");
    assert!(matches!(
        audio.push_audio(packet(0, 48_000, 1)),
        Err(EncodeError::NonMonotonic { .. })
    ));
    audio.finish().expect("audio EOS");
}

#[test]
fn dropping_an_unfinished_writer_never_publishes_a_track() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let path = temporary.path().join("microphone.wav");
    let writer = TrackWriter::open_audio(
        &path,
        AudioConfig {
            sample_rate: 48_000,
            channels: 1,
        },
        LIMITS,
    )
    .expect("audio writer");
    writer
        .push_audio(AudioPacket {
            start_ns: 0,
            sample_rate: 48_000,
            channels: 1,
            frames: 480,
            data: vec![0.5; 480],
        })
        .expect("packet");
    drop(writer);
    assert!(!path.exists());
}

#[test]
fn missing_gstreamer_plugin_fails_before_publishing_a_track() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let destination = temporary.path().join("missing-plugin.wav");
    if std::env::var_os("BEAM_MEDIA_ENCODE_MISSING_PLUGIN_CHILD").is_some() {
        let error = TrackWriter::open_audio(
            &destination,
            AudioConfig {
                sample_rate: 48_000,
                channels: 1,
            },
            LIMITS,
        )
        .err()
        .expect("a missing appsrc plugin must fail the writer");
        assert!(error.to_string().contains("appsrc"));
        assert!(!destination.exists());
        return;
    }
    let plugins = temporary.path().join("plugins");
    std::fs::create_dir(&plugins).expect("empty plugin directory");
    let child = std::process::Command::new(std::env::current_exe().expect("test binary"))
        .args([
            "--exact",
            "missing_gstreamer_plugin_fails_before_publishing_a_track",
            "--nocapture",
        ])
        .env("BEAM_MEDIA_ENCODE_MISSING_PLUGIN_CHILD", "1")
        .env("GST_PLUGIN_SYSTEM_PATH_1_0", "")
        .env("GST_PLUGIN_PATH_1_0", plugins)
        .env(
            "GST_REGISTRY_1_0",
            temporary.path().join("empty-registry.bin"),
        )
        .output()
        .expect("isolated GStreamer subprocess");
    assert!(
        child.status.success(),
        "missing-plugin check failed: {} {}",
        String::from_utf8_lossy(&child.stdout),
        String::from_utf8_lossy(&child.stderr)
    );
}

#[cfg(target_os = "linux")]
#[test]
fn file_size_limit_reports_a_storage_failure_without_publishing_media() {
    if let Some(directory) = std::env::var_os("BEAM_MEDIA_ENCODE_FILE_LIMIT_CHILD_DIR") {
        exercise_file_size_limit(std::path::PathBuf::from(directory));
        return;
    }
    let temporary = tempfile::tempdir().expect("tempdir");
    let child = std::process::Command::new(std::env::current_exe().expect("test binary"))
        .args([
            "--exact",
            "file_size_limit_reports_a_storage_failure_without_publishing_media",
            "--nocapture",
        ])
        .env("BEAM_MEDIA_ENCODE_FILE_LIMIT_CHILD_DIR", temporary.path())
        .output()
        .expect("limited writer subprocess");
    assert!(
        child.status.success(),
        "limited writer failed: {}",
        String::from_utf8_lossy(&child.stdout)
    );
    assert!(!temporary.path().join("limited.wav").exists());
}

#[cfg(target_os = "linux")]
fn exercise_file_size_limit(directory: std::path::PathBuf) {
    let limit = libc::rlimit {
        rlim_cur: 4096,
        rlim_max: 4096,
    };
    unsafe {
        libc::signal(libc::SIGXFSZ, libc::SIG_IGN);
        assert_eq!(libc::setrlimit(libc::RLIMIT_FSIZE, &limit), 0);
    }
    let path = directory.join("limited.wav");
    let writer = TrackWriter::open_audio(
        &path,
        AudioConfig {
            sample_rate: 48_000,
            channels: 1,
        },
        LIMITS,
    )
    .expect("open limited writer");
    writer
        .push_audio(AudioPacket {
            start_ns: 0,
            sample_rate: 48_000,
            channels: 1,
            frames: 4096,
            data: vec![0.25; 4096],
        })
        .expect("queue packet before storage failure");
    assert!(writer.finish().is_err());
    assert_eq!(
        std::fs::metadata(path.with_file_name("limited.wav.part"))
            .expect("partial file")
            .len(),
        4096
    );
    assert!(!path.exists());
}
