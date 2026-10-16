use std::{path::Path, time::Instant};

use crossbeam_channel::{Receiver, Sender, bounded, select_biased};
use windows::{
    Foundation::{TimeSpan, TypedEventHandler},
    Media::{
        Core::{MediaStreamSample, MediaStreamSource, VideoStreamDescriptor},
        MediaProperties::{
            ContainerEncodingProperties, MediaEncodingProfile, MediaEncodingSubtypes,
            VideoEncodingProperties,
        },
        Transcoding::{MediaTranscoder, TranscodeFailureReason},
    },
    Storage::{FileAccessMode, StorageFile, Streams::IRandomAccessStream},
    core::HSTRING,
};
use windows_future::IAsyncActionWithProgress;

use super::{async_wait, sample_pump::SamplePump};
use crate::screen::encoder_negotiation::{EncoderMode, EncoderStartFailure, negotiate_encoder};

pub(super) struct EncoderStartup {
    pub sender: Option<Sender<MediaStreamSample>>,
    pub completion: Receiver<Result<(), EncoderStartFailure>>,
    pub pump: SamplePump,
    action: IAsyncActionWithProgress<f64>,
    source: MediaStreamSource,
    starting_token: i64,
}

struct TranscodeJob {
    action: IAsyncActionWithProgress<f64>,
    completion: Receiver<Result<(), EncoderStartFailure>>,
}

impl Drop for EncoderStartup {
    fn drop(&mut self) {
        self.sender.take();
        let _ = self.action.Cancel();
        let _ = self.pump.stop();
        let _ = self.source.RemoveStarting(self.starting_token);
    }
}

pub(super) fn initialize(
    path: &Path,
    width: u32,
    height: u32,
    bitrate: u32,
    fps: u32,
    capacity: usize,
    mode: Option<EncoderMode>,
) -> Result<EncoderStartup, String> {
    let deadline = async_wait::initialization_deadline();
    std::fs::OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(path)
        .map_err(|error| format!("Windows encoder create output: {error}"))?;
    let canonical = std::fs::canonicalize(path).map_err(|error| error.to_string())?;
    // WinRT requires a DOS/UNC path rather than Rust's extended-length prefix.
    let path = canonical.to_string_lossy();
    let path = path.strip_prefix("\\\\?\\UNC\\").map_or_else(
        || path.strip_prefix("\\\\?\\").unwrap_or(&path).to_owned(),
        |unc| format!("\\\\{unc}"),
    );
    let output = (|| -> windows::core::Result<_> {
        let file = async_wait::wait(
            StorageFile::GetFileFromPathAsync(&HSTRING::from(path))?,
            deadline,
        )?;
        async_wait::wait(file.OpenAsync(FileAccessMode::ReadWrite)?, deadline)
    })()
    .map_err(|error| format!("Windows encoder open output: {error}"))?;
    let attempt = |mode| {
        // Only this newly created, sample-free output belongs to negotiation.
        // An existing recording file is never opened or truncated by this path.
        output
            .SetSize(0)
            .and_then(|()| output.Seek(0))
            .map_err(|error| {
                EncoderStartFailure::terminal(format!("Windows encoder reset output: {error}"))
            })?;
        start(
            &output,
            (width, height),
            bitrate,
            fps,
            capacity,
            mode,
            deadline,
        )
    };
    match mode {
        Some(mode) => attempt(mode).map_err(|error| error.message),
        None => negotiate_encoder(deadline, attempt),
    }
}

fn start(
    output: &IRandomAccessStream,
    (width, height): (u32, u32),
    bitrate: u32,
    fps: u32,
    capacity: usize,
    mode: EncoderMode,
    deadline: Instant,
) -> Result<EncoderStartup, EncoderStartFailure> {
    let context = |error| {
        EncoderStartFailure::terminal(format!(
            "Windows encoder configure {} {width}x{height}@{fps}: {error}",
            mode.label()
        ))
    };
    let profile = encoding_profile(width, height, bitrate, fps).map_err(context)?;
    let raw = VideoEncodingProperties::CreateUncompressed(
        &MediaEncodingSubtypes::Bgra8().map_err(context)?,
        width,
        height,
    )
    .map_err(context)?;
    set_ratios(&raw, fps).map_err(context)?;
    let descriptor = VideoStreamDescriptor::Create(&raw).map_err(context)?;
    let source = MediaStreamSource::CreateFromDescriptor(&descriptor).map_err(context)?;
    source
        .SetBufferTime(TimeSpan { Duration: 0 })
        .map_err(context)?;
    let starting_token =
        source
            .Starting(&TypedEventHandler::new(
                |_,
                 args: windows::core::Ref<
                    windows::Media::Core::MediaStreamSourceStartingEventArgs,
                >| {
                    args.ok()?
                        .Request()?
                        .SetActualStartPosition(TimeSpan { Duration: 0 })
                },
            ))
            .map_err(context)?;
    let (sender, receiver) = bounded(capacity);
    let pump = match SamplePump::attach(&source, receiver) {
        Ok(pump) => pump,
        Err(error) => {
            let _ = source.RemoveStarting(starting_token);
            return Err(EncoderStartFailure::terminal(error));
        }
    };
    // Always detach Starting, including errors before a transcode action exists.
    let result = prepare(&source, output, &profile, mode, deadline);
    let TranscodeJob { action, completion } = match result {
        Ok(result) => result,
        Err(error) => {
            let _ = source.RemoveStarting(starting_token);
            return Err(error);
        }
    };
    let startup = EncoderStartup {
        sender: Some(sender),
        completion,
        pump,
        action,
        source,
        starting_token,
    };
    // TranscodeAsync can fail after Prepare succeeds, before it requests a
    // sample. Do not declare the encoder ready or lose the first captured image.
    select_biased! {
        recv(startup.completion) -> result => {
            Err(match result {
                Ok(Err(error)) => error,
                _ => EncoderStartFailure::terminal("Windows encoder exited before requesting its first image"),
            })
        }
        recv(startup.pump.ready()) -> result => {
            startup.pump.check().map_err(EncoderStartFailure::terminal)?;
            result.map_err(|_| EncoderStartFailure::terminal("Windows sample worker stopped during initialization"))?;
            Ok(startup)
        }
        default(deadline.saturating_duration_since(Instant::now())) => {
            Err(EncoderStartFailure::terminal("Windows encoder initialization exceeded its deadline waiting for the first sample request"))
        }
    }
}

fn set_ratios(video: &VideoEncodingProperties, fps: u32) -> windows::core::Result<()> {
    let rate = video.FrameRate()?;
    rate.SetNumerator(fps)?;
    rate.SetDenominator(1)?;
    let aspect = video.PixelAspectRatio()?;
    aspect.SetNumerator(1)?;
    aspect.SetDenominator(1)
}

fn encoding_profile(
    width: u32,
    height: u32,
    bitrate: u32,
    fps: u32,
) -> windows::core::Result<MediaEncodingProfile> {
    // Auto is a camera preset which may override manually supplied properties.
    // A MediaStreamSource must describe its actual screen frames explicitly.
    let profile = MediaEncodingProfile::new()?;
    let container = ContainerEncodingProperties::new()?;
    container.SetSubtype(&MediaEncodingSubtypes::Mpeg4()?)?;
    profile.SetContainer(&container)?;
    let video = VideoEncodingProperties::CreateH264()?;
    video.SetWidth(width)?;
    video.SetHeight(height)?;
    video.SetBitrate(bitrate)?;
    set_ratios(&video, fps)?;
    profile.SetVideo(&video)?;
    profile.SetAudio(None)?;
    Ok(profile)
}

fn prepare(
    source: &MediaStreamSource,
    output: &IRandomAccessStream,
    profile: &MediaEncodingProfile,
    mode: EncoderMode,
    deadline: Instant,
) -> Result<TranscodeJob, EncoderStartFailure> {
    let failure = move |stage: &str, error: windows::core::Error| {
        EncoderStartFailure::codec(
            &format!("{} {stage}", mode.label()),
            error.code().0 as u32,
            error,
        )
    };
    let transcoder = MediaTranscoder::new().map_err(|error| failure("create transcoder", error))?;
    transcoder
        .SetHardwareAccelerationEnabled(mode == EncoderMode::Accelerated)
        .map_err(|error| failure("acceleration mode", error))?;
    let prepared = async_wait::wait(
        transcoder
            .PrepareMediaStreamSourceTranscodeAsync(source, output, profile)
            .map_err(|error| failure("prepare", error))?,
        deadline,
    )
    .map_err(|error| failure("prepare", error))?;
    if !prepared
        .CanTranscode()
        .map_err(|error| failure("capability", error))?
    {
        let reason = prepared
            .FailureReason()
            .map_err(|error| failure("failure reason", error))?;
        let message = format!(
            "Windows {} encoder cannot encode this recording: {reason:?}",
            mode.label()
        );
        return Err(
            if matches!(
                reason,
                TranscodeFailureReason::CodecNotFound | TranscodeFailureReason::InvalidProfile
            ) {
                EncoderStartFailure::unsupported(message)
            } else {
                EncoderStartFailure::terminal(message)
            },
        );
    }
    let action = prepared
        .TranscodeAsync()
        .map_err(|error| failure("start", error))?;
    let (completed, completion) = bounded(1);
    if let Err(error) = action.when(move |result| {
        // Release the rejected transform before another candidate can start.
        drop(transcoder);
        let _ = completed.try_send(result.map_err(|error| failure("transcode", error)));
    }) {
        let _ = action.Cancel();
        return Err(EncoderStartFailure::terminal(format!(
            "Windows encoder completion handler: {error}"
        )));
    }
    Ok(TranscodeJob { action, completion })
}

#[cfg(test)]
#[path = "encoder_profile_tests.rs"]
mod tests;
