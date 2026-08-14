use std::{
    fs::File,
    io::{Read, Write},
    path::{Path, PathBuf},
    process::{Child, ChildStdin, Command, Stdio},
    thread::JoinHandle,
};

use crate::{CaptureError, NativeCaptureErrorCode, screen::OwnedVideoFrame};

use super::FfmpegCapabilities;

const MAX_STDERR_BYTES: usize = 64 * 1024;

pub(super) struct FfmpegProcess {
    child: Option<Child>,
    stdin: Option<ChildStdin>,
    stderr: Option<JoinHandle<String>>,
    final_path: PathBuf,
    partial_path: PathBuf,
    frames: u64,
}

pub(super) struct FfmpegProcessConfig<'a> {
    pub(super) capabilities: &'a FfmpegCapabilities,
    pub(super) output: &'a Path,
    pub(super) width: u32,
    pub(super) height: u32,
    pub(super) fps: u32,
    pub(super) bitrate_bps: u64,
    pub(super) keyframe_interval_seconds: u8,
}

impl FfmpegProcess {
    pub(super) fn spawn(config: FfmpegProcessConfig<'_>) -> Result<Self, CaptureError> {
        validate_config(&config)?;
        let final_path = config.output.to_owned();
        let partial_path = partial_path(config.output)?;
        if final_path.exists() || partial_path.exists() {
            return Err(ffmpeg_error(
                NativeCaptureErrorCode::FfmpegOutputInvalid,
                format!(
                    "refusing to overwrite an existing screen segment at {}",
                    final_path.display()
                ),
            ));
        }
        let parent = final_path.parent().ok_or_else(|| {
            ffmpeg_error(
                NativeCaptureErrorCode::FfmpegOutputInvalid,
                "screen segment path has no parent directory",
            )
        })?;
        std::fs::create_dir_all(parent).map_err(|error| CaptureError::storage(parent, error))?;
        let arguments = arguments(&config, &partial_path);
        let mut child = Command::new(&config.capabilities.executable)
            .args(&arguments)
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|error| {
                ffmpeg_error(
                    NativeCaptureErrorCode::FfmpegUnavailable,
                    format!(
                        "failed to start {}: {error}",
                        config.capabilities.executable.display()
                    ),
                )
            })?;
        let stdin = child.stdin.take().ok_or_else(|| {
            ffmpeg_error(
                NativeCaptureErrorCode::FfmpegFailed,
                "FFmpeg did not expose its input pipe",
            )
        })?;
        let stderr = child.stderr.take().ok_or_else(|| {
            ffmpeg_error(
                NativeCaptureErrorCode::FfmpegFailed,
                "FFmpeg did not expose its diagnostic pipe",
            )
        })?;
        let stderr = std::thread::Builder::new()
            .name("beam-ffmpeg-stderr".into())
            .spawn(move || drain_stderr(stderr))
            .map_err(|error| {
                ffmpeg_error(
                    NativeCaptureErrorCode::FfmpegFailed,
                    format!("failed to start the FFmpeg diagnostic reader: {error}"),
                )
            })?;
        Ok(Self {
            child: Some(child),
            stdin: Some(stdin),
            stderr: Some(stderr),
            final_path,
            partial_path,
            frames: 0,
        })
    }

    pub(super) fn write_frame(&mut self, frame: &OwnedVideoFrame) -> Result<(), CaptureError> {
        let row_bytes = usize::try_from(frame.width)
            .ok()
            .and_then(|width| width.checked_mul(4))
            .ok_or_else(|| ffmpeg_failed("video row size overflows"))?;
        let required = frame
            .stride
            .checked_mul(
                usize::try_from(frame.height)
                    .map_err(|_| ffmpeg_failed("video height is not representable"))?,
            )
            .ok_or_else(|| ffmpeg_failed("video frame size overflows"))?;
        if frame.stride < row_bytes || frame.pixels.len() < required {
            return Err(ffmpeg_failed(format!(
                "invalid BGRA frame layout: stride={}, bytes={}",
                frame.stride,
                frame.pixels.len()
            )));
        }
        let stdin = self
            .stdin
            .as_mut()
            .ok_or_else(|| ffmpeg_failed("FFmpeg input is already closed"))?;
        if frame.stride == row_bytes {
            stdin
                .write_all(&frame.pixels[..required])
                .map_err(ffmpeg_write_error)?;
        } else {
            for row in frame.pixels[..required].chunks_exact(frame.stride) {
                stdin
                    .write_all(&row[..row_bytes])
                    .map_err(ffmpeg_write_error)?;
            }
        }
        self.frames = self.frames.saturating_add(1);
        Ok(())
    }

    pub(super) fn finish(mut self) -> Result<(), CaptureError> {
        self.finish_inner()
    }

    fn finish_inner(&mut self) -> Result<(), CaptureError> {
        drop(self.stdin.take());
        let status = self
            .child
            .as_mut()
            .ok_or_else(|| ffmpeg_failed("FFmpeg process was already finalized"))?
            .wait()
            .map_err(ffmpeg_write_error)?;
        self.child = None;
        let stderr = self
            .stderr
            .take()
            .map_or_else(String::new, |reader| reader.join().unwrap_or_default());
        if !status.success() {
            self.remove_partial();
            return Err(ffmpeg_failed(format!(
                "FFmpeg exited with {status}: {}",
                stderr.trim()
            )));
        }
        if self.frames == 0 {
            self.remove_partial();
            return Err(ffmpeg_error(
                NativeCaptureErrorCode::FfmpegOutputInvalid,
                "FFmpeg received no video frames",
            ));
        }
        let metadata = std::fs::metadata(&self.partial_path)
            .map_err(|error| CaptureError::storage(&self.partial_path, error))?;
        if metadata.len() == 0 {
            self.remove_partial();
            return Err(ffmpeg_error(
                NativeCaptureErrorCode::FfmpegOutputInvalid,
                "FFmpeg produced an empty MP4 segment",
            ));
        }
        File::open(&self.partial_path)
            .and_then(|file| file.sync_all())
            .map_err(|error| CaptureError::storage(&self.partial_path, error))?;
        std::fs::rename(&self.partial_path, &self.final_path)
            .map_err(|error| CaptureError::storage(&self.final_path, error))?;
        sync_parent(&self.final_path)?;
        Ok(())
    }

    fn remove_partial(&self) {
        if self.partial_path.exists() {
            let _ = std::fs::remove_file(&self.partial_path);
        }
    }
}

impl Drop for FfmpegProcess {
    fn drop(&mut self) {
        drop(self.stdin.take());
        if let Some(child) = self.child.as_mut() {
            let _ = child.kill();
            let _ = child.wait();
        }
        self.child = None;
        if let Some(stderr) = self.stderr.take() {
            let _ = stderr.join();
        }
        self.remove_partial();
    }
}

fn validate_config(config: &FfmpegProcessConfig<'_>) -> Result<(), CaptureError> {
    if config.width == 0
        || config.height == 0
        || config.fps == 0
        || config.bitrate_bps == 0
        || config.keyframe_interval_seconds == 0
    {
        return Err(CaptureError::InvalidConfiguration(
            "FFmpeg dimensions, fps, bitrate and keyframe interval must be non-zero".into(),
        ));
    }
    Ok(())
}

pub(super) fn arguments(config: &FfmpegProcessConfig<'_>, partial_path: &Path) -> Vec<String> {
    let keyframe_interval = config
        .fps
        .saturating_mul(u32::from(config.keyframe_interval_seconds));
    vec![
        "-hide_banner".into(),
        "-loglevel".into(),
        "error".into(),
        "-nostdin".into(),
        "-f".into(),
        "rawvideo".into(),
        "-pixel_format".into(),
        "bgra".into(),
        "-video_size".into(),
        format!("{}x{}", config.width, config.height),
        "-framerate".into(),
        config.fps.to_string(),
        "-use_wallclock_as_timestamps".into(),
        "1".into(),
        "-i".into(),
        "pipe:0".into(),
        "-an".into(),
        "-c:v".into(),
        config.capabilities.encoder.clone(),
        "-b:v".into(),
        config.bitrate_bps.to_string(),
        "-g".into(),
        keyframe_interval.to_string(),
        "-vf".into(),
        "pad=ceil(iw/2)*2:ceil(ih/2)*2".into(),
        "-pix_fmt".into(),
        "yuv420p".into(),
        "-fps_mode".into(),
        "vfr".into(),
        "-movflags".into(),
        "+faststart".into(),
        "-n".into(),
        partial_path.display().to_string(),
    ]
}

pub(super) fn partial_path(final_path: &Path) -> Result<PathBuf, CaptureError> {
    let stem = final_path.file_stem().ok_or_else(|| {
        ffmpeg_error(
            NativeCaptureErrorCode::FfmpegOutputInvalid,
            "screen segment path has no file stem",
        )
    })?;
    Ok(final_path.with_file_name(format!("{}.partial.mp4", stem.to_string_lossy())))
}

fn drain_stderr(mut stderr: impl Read) -> String {
    let mut retained = Vec::new();
    let mut buffer = [0_u8; 4096];
    while let Ok(count) = stderr.read(&mut buffer) {
        if count == 0 {
            break;
        }
        retained.extend_from_slice(&buffer[..count]);
        if retained.len() > MAX_STDERR_BYTES {
            retained.drain(..retained.len() - MAX_STDERR_BYTES);
        }
    }
    String::from_utf8_lossy(&retained).into_owned()
}

fn sync_parent(path: &Path) -> Result<(), CaptureError> {
    if let Some(parent) = path.parent()
        && let Err(error) = File::open(parent).and_then(|directory| directory.sync_all())
        && !matches!(
            error.kind(),
            std::io::ErrorKind::PermissionDenied | std::io::ErrorKind::InvalidInput
        )
    {
        return Err(CaptureError::storage(parent, error));
    }
    Ok(())
}

fn ffmpeg_write_error(error: impl std::fmt::Display) -> CaptureError {
    ffmpeg_failed(format!("failed to write or finalize FFmpeg: {error}"))
}

fn ffmpeg_failed(message: impl Into<String>) -> CaptureError {
    ffmpeg_error(NativeCaptureErrorCode::FfmpegFailed, message)
}

fn ffmpeg_error(code: NativeCaptureErrorCode, message: impl Into<String>) -> CaptureError {
    CaptureError::native(code, message)
}
