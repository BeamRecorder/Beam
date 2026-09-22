use std::{io::Cursor, mem::size_of};

use pipewire::spa::{
    self,
    param::{ParamType, audio::AudioInfoRaw, format::MediaSubtype, format::MediaType},
    pod::{Pod, Value},
};

use crate::AudioError;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) struct NegotiatedFormat {
    pub sample_rate: u32,
    pub channels: u16,
}

pub(super) fn parse_format(param: &Pod) -> Result<NegotiatedFormat, AudioError> {
    let (media_type, subtype) = spa::param::format_utils::parse_format(param)
        .map_err(|error| AudioError::Backend(error.to_string()))?;
    if media_type != MediaType::Audio || subtype != MediaSubtype::Raw {
        return Err(AudioError::Unsupported(
            "PipeWire selected non-raw audio".into(),
        ));
    }
    let mut raw = AudioInfoRaw::new();
    raw.parse(param)
        .map_err(|error| AudioError::Backend(error.to_string()))?;
    if raw.format() != spa::param::audio::AudioFormat::F32LE {
        return Err(AudioError::Unsupported(format!(
            "PipeWire selected {:?}, expected F32LE",
            raw.format()
        )));
    }
    let channels = u16::try_from(raw.channels())
        .map_err(|_| AudioError::Unsupported("PipeWire channel count exceeds u16".into()))?;
    if raw.rate() == 0 || channels == 0 {
        return Err(AudioError::Unsupported(
            "PipeWire selected zero rate or channels".into(),
        ));
    }
    Ok(NegotiatedFormat {
        sample_rate: raw.rate(),
        channels,
    })
}

pub(super) fn format_parameter() -> Result<Vec<u8>, AudioError> {
    let mut info = AudioInfoRaw::new();
    info.set_format(spa::param::audio::AudioFormat::F32LE);
    let object = spa::pod::Object {
        type_: spa::utils::SpaTypes::ObjectParamFormat.as_raw(),
        id: ParamType::EnumFormat.as_raw(),
        properties: info.into(),
    };
    spa::pod::serialize::PodSerializer::serialize(Cursor::new(Vec::new()), &Value::Object(object))
        .map(|(cursor, _)| cursor.into_inner())
        .map_err(|error| AudioError::Backend(error.to_string()))
}

pub(super) fn header_meta_parameter() -> Result<Vec<u8>, AudioError> {
    let size = i32::try_from(size_of::<spa::sys::spa_meta_header>())
        .map_err(|_| AudioError::Backend("PipeWire header metadata is too large".into()))?;
    let object = spa::pod::Object {
        type_: spa::utils::SpaTypes::ObjectParamMeta.as_raw(),
        id: ParamType::Meta.as_raw(),
        properties: vec![
            spa::pod::Property::new(
                spa::sys::SPA_PARAM_META_type,
                Value::Id(spa::utils::Id(spa::sys::SPA_META_Header)),
            ),
            spa::pod::Property::new(spa::sys::SPA_PARAM_META_size, Value::Int(size)),
        ],
    };
    spa::pod::serialize::PodSerializer::serialize(Cursor::new(Vec::new()), &Value::Object(object))
        .map(|(cursor, _)| cursor.into_inner())
        .map_err(|error| AudioError::Backend(error.to_string()))
}

#[path = "../../test/linux/format.rs"]
mod format_checks;
