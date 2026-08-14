use std::{
    io::Read,
    path::PathBuf,
    process::{Command, Stdio},
    time::{Duration, Instant},
};

use crate::{CaptureError, NativeCaptureErrorCode};

const FFMPEG_PATH_ENV: &str = "BEAM_FFMPEG_PATH";
const FFMPEG_PROBE_TIMEOUT: Duration = Duration::from_secs(3);

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct FfmpegCapabilities {
    pub(crate) executable: PathBuf,
    pub(crate) encoder: String,
}

pub(crate) fn probe_ffmpeg() -> Result<FfmpegCapabilities, CaptureError> {
    let executable = std::env::var_os(FFMPEG_PATH_ENV)
        .filter(|value| !value.is_empty())
        .map_or_else(|| PathBuf::from("ffmpeg"), PathBuf::from);
    probe_ffmpeg_at(executable)
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
    let encoder = select_h264_encoder(&encoders).ok_or_else(|| {
        ffmpeg_error(
            NativeCaptureErrorCode::FfmpegEncoderUnavailable,
            "FFmpeg has neither the libx264 nor libopenh264 encoder",
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
        encoder: encoder.into(),
    })
}

fn run(executable: &std::path::Path, arguments: &[&str]) -> Result<String, CaptureError> {
    let mut child = Command::new(executable)
        .args(arguments)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| {
            ffmpeg_error(
                NativeCaptureErrorCode::FfmpegUnavailable,
                format!(
                    "failed to execute {}: {error}. Install FFmpeg or set {FFMPEG_PATH_ENV}",
                    executable.display()
                ),
            )
        })?;
    let deadline = Instant::now() + FFMPEG_PROBE_TIMEOUT;
    let status = loop {
        if let Some(status) = child.try_wait().map_err(|error| {
            ffmpeg_error(
                NativeCaptureErrorCode::FfmpegUnavailable,
                format!("failed while waiting for {}: {error}", executable.display()),
            )
        })? {
            break status;
        }
        if Instant::now() >= deadline {
            let _ = child.kill();
            let _ = child.wait();
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
    use std::{fs, os::unix::fs::PermissionsExt};

    use super::{has_named_component, probe_ffmpeg_at, select_h264_encoder};

    fn executable(script: &str) -> (tempfile::TempDir, std::path::PathBuf) {
        let directory = tempfile::tempdir().expect("temporary FFmpeg probe directory");
        let path = directory.path().join("ffmpeg-test");
        fs::write(&path, script).expect("write FFmpeg probe");
        let mut permissions = fs::metadata(&path).expect("probe metadata").permissions();
        permissions.set_mode(0o755);
        fs::set_permissions(&path, permissions).expect("make probe executable");
        (directory, path)
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
        assert!(has_named_component(" E mp4 MP4 muxer", "mp4"));
        assert!(!has_named_component(" E mov MP4 muxer", "mp4"));
        assert!(!has_named_component("mp4", "mp4"));
    }

    #[test]
    fn probe_rejects_a_missing_executable() {
        let error = probe_ffmpeg_at("/definitely/missing/beam-ffmpeg".into())
            .expect_err("missing FFmpeg must fail");
        assert_eq!(error.code(), "ffmpeg-unavailable");
    }

    #[test]
    fn probe_accepts_openh264_and_the_mp4_muxer() {
        let (_directory, path) = executable(
            "#!/bin/sh\ncase \"$2\" in\n-version) printf 'ffmpeg version fake\\n' ;;\n-encoders) printf ' V....D libopenh264 fake\\n' ;;\n-muxers) printf ' E mp4 fake\\n' ;;\nesac\n",
        );
        let capabilities = probe_ffmpeg_at(path).expect("valid fake FFmpeg");
        assert_eq!(capabilities.encoder, "libopenh264");
    }

    #[test]
    fn probe_rejects_ffmpeg_without_a_supported_encoder() {
        let (_directory, path) = executable(
            "#!/bin/sh\ncase \"$2\" in\n-version) printf 'ffmpeg version fake\\n' ;;\n-encoders) printf ' V..... mpeg4 fake\\n' ;;\n-muxers) printf ' E mp4 fake\\n' ;;\nesac\n",
        );
        let error = probe_ffmpeg_at(path).expect_err("missing H.264 encoder must fail");
        assert_eq!(error.code(), "ffmpeg-encoder-unavailable", "{error}");
    }

    #[test]
    fn probe_rejects_ffmpeg_without_the_mp4_muxer() {
        let (_directory, path) = executable(
            "#!/bin/sh\ncase \"$2\" in\n-version) printf 'ffmpeg version fake\\n' ;;\n-encoders) printf ' V....D libx264 fake\\n' ;;\n-muxers) printf ' E matroska fake\\n' ;;\nesac\n",
        );
        let error = probe_ffmpeg_at(path).expect_err("missing MP4 muxer must fail");
        assert_eq!(error.code(), "ffmpeg-unavailable");
    }
}
