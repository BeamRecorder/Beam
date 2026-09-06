use std::{
    io::Read,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::OnceLock,
    time::{Duration, Instant},
};

use crate::{CaptureError, NativeCaptureErrorCode};

use super::{FfmpegAcceleration, FfmpegEncoder, owned_child};

const FFMPEG_PATH_ENV: &str = "BEAM_FFMPEG_PATH";
const FFMPEG_PROBE_TIMEOUT: Duration = Duration::from_secs(3);

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct FfmpegCapabilities {
    pub(crate) executable: PathBuf,
    pub(crate) encoder: FfmpegEncoder,
}

pub(crate) fn probe_ffmpeg() -> Result<FfmpegCapabilities, CaptureError> {
    static CAPABILITIES: OnceLock<FfmpegCapabilities> = OnceLock::new();
    if let Some(capabilities) = CAPABILITIES.get() {
        return Ok(capabilities.clone());
    }
    let executable = std::env::var_os(FFMPEG_PATH_ENV)
        .filter(|value| !value.is_empty())
        .map_or_else(|| PathBuf::from("ffmpeg"), PathBuf::from);
    let capabilities = probe_ffmpeg_at(executable)?;
    let _ = CAPABILITIES.set(capabilities.clone());
    Ok(capabilities)
}

fn probe_ffmpeg_at(executable: PathBuf) -> Result<FfmpegCapabilities, CaptureError> {
    let version_output = run(&executable, &["-hide_banner", "-version"])?;
    version_output
        .lines()
        .next()
        .filter(|line| line.starts_with("ffmpeg version "))
        .ok_or_else(|| {
            ffmpeg_error(
                NativeCaptureErrorCode::FfmpegUnavailable,
                "the configured executable did not identify itself as FFmpeg",
            )
        })?;
    let encoders = run(&executable, &["-hide_banner", "-encoders"])?;
    let encoder = select_encoder(&executable, &encoders).ok_or_else(|| {
        ffmpeg_error(
            NativeCaptureErrorCode::FfmpegEncoderUnavailable,
            "FFmpeg has no working hardware H.264/AV1/VP9 encoder and neither libx264 nor libopenh264",
        )
    })?;
    let muxers = run(&executable, &["-hide_banner", "-muxers"])?;
    if !has_named_component(&muxers, "mp4") {
        return Err(ffmpeg_error(
            NativeCaptureErrorCode::FfmpegUnavailable,
            "FFmpeg does not provide the MP4 muxer required by Beam",
        ));
    }
    Ok(FfmpegCapabilities {
        executable,
        encoder,
    })
}

fn select_encoder(executable: &Path, output: &str) -> Option<FfmpegEncoder> {
    for candidate in hardware_candidates() {
        if has_named_component(output, &candidate.name)
            && probe_hardware_encoder(executable, &candidate)
        {
            return Some(candidate);
        }
    }
    select_h264_encoder(output).map(FfmpegEncoder::software)
}

fn hardware_candidates() -> Vec<FfmpegEncoder> {
    let mut candidates = vec![
        hardware("h264_nvenc", "h264", FfmpegAcceleration::Nvenc),
        hardware("h264_qsv", "h264", FfmpegAcceleration::Qsv),
    ];
    for device in vaapi_devices() {
        candidates.push(hardware(
            "h264_vaapi",
            "h264",
            FfmpegAcceleration::Vaapi {
                device: device.clone(),
            },
        ));
    }
    candidates.extend([
        hardware("h264_amf", "h264", FfmpegAcceleration::Amf),
        hardware("av1_nvenc", "av1", FfmpegAcceleration::Nvenc),
        hardware("av1_qsv", "av1", FfmpegAcceleration::Qsv),
    ]);
    for device in vaapi_devices() {
        candidates.push(hardware(
            "av1_vaapi",
            "av1",
            FfmpegAcceleration::Vaapi {
                device: device.clone(),
            },
        ));
        candidates.push(hardware(
            "vp9_vaapi",
            "vp9",
            FfmpegAcceleration::Vaapi { device },
        ));
    }
    candidates.extend([
        hardware("av1_amf", "av1", FfmpegAcceleration::Amf),
        hardware("vp9_qsv", "vp9", FfmpegAcceleration::Qsv),
    ]);
    candidates
}

fn hardware(name: &str, codec: &str, acceleration: FfmpegAcceleration) -> FfmpegEncoder {
    FfmpegEncoder {
        name: name.into(),
        codec: codec.into(),
        acceleration,
    }
}

fn vaapi_devices() -> Vec<PathBuf> {
    let Ok(entries) = std::fs::read_dir("/dev/dri") else {
        return Vec::new();
    };
    let mut devices = entries
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.starts_with("renderD"))
        })
        .collect::<Vec<_>>();
    devices.sort();
    devices
}

fn probe_hardware_encoder(executable: &Path, encoder: &FfmpegEncoder) -> bool {
    let mut arguments = encoder.device_arguments();
    arguments.extend([
        "-hide_banner".into(),
        "-loglevel".into(),
        "error".into(),
        "-nostdin".into(),
        "-f".into(),
        "lavfi".into(),
        "-i".into(),
        "color=c=black:s=1280x720:r=60".into(),
        "-frames:v".into(),
        "2".into(),
        "-vf".into(),
        encoder.filter().into(),
        "-b:v".into(),
        "12000000".into(),
        "-c:v".into(),
        encoder.name.clone(),
        "-f".into(),
        "null".into(),
        "-".into(),
    ]);
    let mut command = Command::new(executable);
    command
        .args(arguments)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    owned_child::configure(&mut command);
    let Ok(mut child) = command.spawn() else {
        return false;
    };
    owned_child::register(&child);
    wait_for_probe(&mut child).is_some_and(|status| status.success())
}

fn wait_for_probe(child: &mut std::process::Child) -> Option<std::process::ExitStatus> {
    let deadline = Instant::now() + FFMPEG_PROBE_TIMEOUT;
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                owned_child::unregister(child);
                return Some(status);
            }
            Ok(None) if Instant::now() < deadline => {
                std::thread::sleep(Duration::from_millis(10));
            }
            _ => {
                owned_child::kill_and_wait(child);
                return None;
            }
        }
    }
}

fn run(executable: &Path, arguments: &[&str]) -> Result<String, CaptureError> {
    let mut command = Command::new(executable);
    command
        .args(arguments)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    owned_child::configure(&mut command);
    let mut child = command.spawn().map_err(|error| {
        ffmpeg_error(
            NativeCaptureErrorCode::FfmpegUnavailable,
            format!(
                "failed to execute {}: {error}. Install FFmpeg or set {FFMPEG_PATH_ENV}",
                executable.display()
            ),
        )
    })?;
    owned_child::register(&child);
    let deadline = Instant::now() + FFMPEG_PROBE_TIMEOUT;
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                owned_child::unregister(&child);
                break status;
            }
            Err(error) => {
                owned_child::kill_and_wait(&mut child);
                return Err(ffmpeg_error(
                    NativeCaptureErrorCode::FfmpegUnavailable,
                    format!("failed while waiting for {}: {error}", executable.display()),
                ));
            }
            Ok(None) => {}
        }
        if Instant::now() >= deadline {
            owned_child::kill_and_wait(&mut child);
            return Err(ffmpeg_error(
                NativeCaptureErrorCode::FfmpegUnavailable,
                format!("{} capability probe timed out", executable.display()),
            ));
        }
        std::thread::sleep(Duration::from_millis(10));
    };
    let mut stdout = String::new();
    let mut stderr = String::new();
    if let Some(mut output) = child.stdout.take() {
        output.read_to_string(&mut stdout).map_err(|error| {
            ffmpeg_error(
                NativeCaptureErrorCode::FfmpegUnavailable,
                format!("failed to read FFmpeg capabilities: {error}"),
            )
        })?;
    }
    if let Some(mut diagnostics) = child.stderr.take() {
        diagnostics.read_to_string(&mut stderr).map_err(|error| {
            ffmpeg_error(
                NativeCaptureErrorCode::FfmpegUnavailable,
                format!("failed to read FFmpeg diagnostics: {error}"),
            )
        })?;
    }
    if !status.success() {
        return Err(ffmpeg_error(
            NativeCaptureErrorCode::FfmpegUnavailable,
            format!(
                "{} exited with {} while checking its capabilities: {}",
                executable.display(),
                status,
                stderr.trim(),
            ),
        ));
    }
    Ok(stdout)
}

fn select_h264_encoder(output: &str) -> Option<&'static str> {
    ["libx264", "libopenh264"]
        .into_iter()
        .find(|name| has_named_component(output, name))
}

fn has_named_component(output: &str, expected: &str) -> bool {
    output
        .lines()
        .filter_map(|line| line.split_whitespace().nth(1))
        .any(|name| name == expected)
}

fn ffmpeg_error(code: NativeCaptureErrorCode, message: impl Into<String>) -> CaptureError {
    CaptureError::native(code, message)
}

#[cfg(test)]
#[allow(clippy::expect_used)]
mod tests {
    use super::{has_named_component, probe_ffmpeg_at, select_h264_encoder};

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
}
