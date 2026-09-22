use std::{path::PathBuf, str::FromStr};

pub const USAGE: &str = "Usage:\n  beam-media-probe devices\n  beam-media-probe record --output DIR [--duration SECONDS] [--camera DEVICE] [--microphone DEVICE] [--system-output DEVICE] [--preview-delay-ms 0..1000] [--no-camera] [--no-microphone] [--no-system-audio]\n  beam-media-probe report --output DIR\n";

pub fn no_extra_arguments(mut arguments: impl Iterator<Item = String>) -> Result<(), String> {
    match arguments.next() {
        Some(argument) => Err(format!("unexpected argument: {argument}")),
        None => Ok(()),
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RecordArgs {
    pub output: PathBuf,
    pub duration_seconds: u64,
    pub preview_delay_ms: u64,
    pub camera: Option<String>,
    pub microphone: Option<String>,
    pub system_output: Option<String>,
    pub no_camera: bool,
    pub no_microphone: bool,
    pub no_system_audio: bool,
}

impl RecordArgs {
    pub fn parse(mut arguments: impl Iterator<Item = String>) -> Result<Self, String> {
        let mut output = None;
        let mut duration_seconds = 5;
        let mut preview_delay_ms = 0;
        let mut camera = None;
        let mut microphone = None;
        let mut system_output = None;
        let mut no_camera = false;
        let mut no_microphone = false;
        let mut no_system_audio = false;
        while let Some(argument) = arguments.next() {
            match argument.as_str() {
                "--output" => output = Some(PathBuf::from(next(&mut arguments, "--output")?)),
                "--duration" => {
                    duration_seconds = u64::from_str(&next(&mut arguments, "--duration")?)
                        .map_err(|_| "duration must be a positive whole number of seconds")?;
                    if duration_seconds == 0 {
                        return Err("duration must be non-zero".into());
                    }
                }
                "--camera" => camera = Some(next(&mut arguments, "--camera")?),
                "--preview-delay-ms" => {
                    preview_delay_ms = u64::from_str(&next(&mut arguments, "--preview-delay-ms")?)
                        .map_err(|_| "preview delay must be a whole number from 0 to 1000 ms")?;
                    if preview_delay_ms > 1000 {
                        return Err("preview delay must be at most 1000 ms".into());
                    }
                }
                "--microphone" => microphone = Some(next(&mut arguments, "--microphone")?),
                "--system-output" => system_output = Some(next(&mut arguments, "--system-output")?),
                "--no-camera" => no_camera = true,
                "--no-microphone" => no_microphone = true,
                "--no-system-audio" => no_system_audio = true,
                _ => return Err(format!("unknown record option: {argument}")),
            }
        }
        let output = output.ok_or("record requires --output DIR")?;
        if no_camera && (camera.is_some() || preview_delay_ms > 0)
            || no_microphone && microphone.is_some()
            || no_system_audio && system_output.is_some()
        {
            return Err("a disabled source cannot also have a device selection".into());
        }
        Ok(Self {
            output,
            duration_seconds,
            preview_delay_ms,
            camera,
            microphone,
            system_output,
            no_camera,
            no_microphone,
            no_system_audio,
        })
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReportArgs {
    pub output: PathBuf,
}

impl ReportArgs {
    pub fn parse(mut arguments: impl Iterator<Item = String>) -> Result<Self, String> {
        if arguments.next().as_deref() != Some("--output") {
            return Err("report requires --output DIR".into());
        }
        let output = PathBuf::from(next(&mut arguments, "--output")?);
        if arguments.next().is_some() {
            return Err("report accepts only --output DIR".into());
        }
        Ok(Self { output })
    }
}

fn next(arguments: &mut impl Iterator<Item = String>, option: &str) -> Result<String, String> {
    arguments
        .next()
        .ok_or_else(|| format!("{option} requires a value"))
}
