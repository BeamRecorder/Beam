use std::io::Cursor;

use pipewire::spa;
use spa::{
    param::{ParamType, audio::AudioInfoRaw, format::MediaSubtype, format::MediaType},
    pod::{Pod, Value},
};

use crate::CaptureError;
use crate::system_audio::SystemAudioFormat;

use super::pipewire_error;

pub(super) fn parse_audio_format(param: &Pod) -> Result<SystemAudioFormat, CaptureError> {
    let (media_type, subtype) = spa::param::format_utils::parse_format(param)
        .map_err(|error| pipewire_error(error.to_string()))?;
    if media_type != MediaType::Audio || subtype != MediaSubtype::Raw {
        return Err(pipewire_error(
            "PipeWire selected a non-raw system audio format",
        ));
    }
    let mut raw = AudioInfoRaw::new();
    raw.parse(param)
        .map_err(|error| pipewire_error(error.to_string()))?;
    if raw.format() != spa::param::audio::AudioFormat::F32LE {
        return Err(pipewire_error(format!(
            "PipeWire selected unsupported system audio format {:?}",
            raw.format()
        )));
    }
    let channels = u16::try_from(raw.channels())
        .map_err(|_| pipewire_error("system audio channel count is too large"))?;
    if raw.rate() == 0 || channels == 0 {
        return Err(pipewire_error(
            "PipeWire selected an invalid system audio rate or channel count",
        ));
    }
    Ok(SystemAudioFormat {
        sample_rate: raw.rate(),
        channels,
    })
}

pub(super) fn audio_format_parameter() -> Result<Vec<u8>, CaptureError> {
    let mut info = AudioInfoRaw::new();
    info.set_format(spa::param::audio::AudioFormat::F32LE);
    let object = spa::pod::Object {
        type_: spa::utils::SpaTypes::ObjectParamFormat.as_raw(),
        id: ParamType::EnumFormat.as_raw(),
        properties: info.into(),
    };
    spa::pod::serialize::PodSerializer::serialize(Cursor::new(Vec::new()), &Value::Object(object))
        .map(|(cursor, _)| cursor.into_inner())
        .map_err(|error| pipewire_error(error.to_string()))
}

pub(super) fn peak_f32le(bytes: &[u8]) -> f32 {
    bytes
        .chunks_exact(4)
        .filter_map(|sample| <[u8; 4]>::try_from(sample).ok())
        .map(f32::from_le_bytes)
        .filter(|sample| sample.is_finite())
        .fold(0.0_f32, |peak, sample| peak.max(sample.abs()))
        .min(1.0)
}
