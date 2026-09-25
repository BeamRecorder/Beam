use std::{io::Cursor, mem::size_of};

use pipewire::{self as pw, spa};
use spa::{
    param::{
        ParamType,
        format::MediaSubtype,
        format::MediaType,
        video::{VideoFlags, VideoInfoRaw},
    },
    pod::{
        ChoiceValue, Pod, PropertyFlags, Value, deserialize::PodDeserializer,
        serialize::PodSerializer,
    },
    utils::{Choice, ChoiceEnum, ChoiceFlags},
};

use crate::CaptureError;

use super::{NativePixelFormat, NegotiatedFormat, format_error, pipewire_error};

// Chromium/WebRTC uses 64 px as its preferred cursor size and accepts anything
// from 1 px through Mutter's 384 px allocation. A range matters here: KWin
// advertises the current theme size as a smaller fixed allocation, and two
// incompatible fixed sizes cause SPA_META_Cursor to disappear entirely.
const PREFERRED_CURSOR_DIMENSION: usize = 64;
const MIN_CURSOR_DIMENSION: usize = 1;
const MAX_CURSOR_DIMENSION: usize = 384;

const fn cursor_meta_size(dimension: usize) -> usize {
    size_of::<spa::sys::spa_meta_cursor>()
        + size_of::<spa::sys::spa_meta_bitmap>()
        + dimension * dimension * 4
}

pub(super) const CURSOR_META_SIZE: usize = cursor_meta_size(MAX_CURSOR_DIMENSION);

pub(super) fn parse_format(param: &Pod) -> Result<NegotiatedFormat, CaptureError> {
    let (media_type, media_subtype) = spa::param::format_utils::parse_format(param)
        .map_err(|error| format_error(error.to_string()))?;
    if media_type != MediaType::Video || media_subtype != MediaSubtype::Raw {
        return Err(format_error("PipeWire selected a non-raw video format"));
    }
    let mut raw = VideoInfoRaw::new();
    raw.parse(param)
        .map_err(|error| format_error(error.to_string()))?;
    let pixel_format = match raw.format() {
        spa::param::video::VideoFormat::BGRx => NativePixelFormat::Bgrx,
        spa::param::video::VideoFormat::BGRA => NativePixelFormat::Bgra,
        spa::param::video::VideoFormat::RGBx => NativePixelFormat::Rgbx,
        spa::param::video::VideoFormat::RGBA => NativePixelFormat::Rgba,
        other => {
            return Err(format_error(format!(
                "unsupported raw video format {other:?}"
            )));
        }
    };
    let format = NegotiatedFormat::new(raw.size().width, raw.size().height, pixel_format)
        .map_err(|error| format_error(error.to_string()))?;
    Ok(if raw.flags().contains(VideoFlags::MODIFIER) {
        let fixation_required =
            raw.flags().bits() & spa::sys::SPA_VIDEO_FLAG_MODIFIER_FIXATION_REQUIRED != 0;
        format.with_modifier(raw.modifier(), fixation_required)
    } else {
        format
    })
}

pub(super) fn parse_format_event(
    param: Option<&Pod>,
) -> Result<Option<NegotiatedFormat>, CaptureError> {
    param.map(parse_format).transpose()
}

pub(super) enum FormatParamEvent {
    Cleared,
    Fixating,
    Ready(NegotiatedFormat),
}

pub(super) fn apply_format_event(
    stream: &pw::stream::Stream,
    param: Option<&Pod>,
) -> Result<FormatParamEvent, CaptureError> {
    let Some(format) = parse_format_event(param)? else {
        return Ok(FormatParamEvent::Cleared);
    };
    if format.modifier_fixation_required {
        let param = param.ok_or_else(|| format_error("missing DMA-BUF format parameter"))?;
        let modifier = format
            .modifier
            .ok_or_else(|| format_error("missing negotiated DMA-BUF modifier"))?;
        let bytes = fixate_modifier_parameter(param, modifier)?;
        let pod = Pod::from_bytes(&bytes)
            .ok_or_else(|| format_error("failed to fixate DMA-BUF modifier"))?;
        stream.update_params(&mut [pod]).map_err(pipewire_error)?;
        return Ok(FormatParamEvent::Fixating);
    }
    update_buffer_params(stream, format)?;
    Ok(FormatParamEvent::Ready(format))
}

fn format_object() -> spa::pod::Object {
    spa::pod::object!(
        spa::utils::SpaTypes::ObjectParamFormat,
        ParamType::EnumFormat,
        spa::pod::property!(
            spa::param::format::FormatProperties::MediaType,
            Id,
            MediaType::Video
        ),
        spa::pod::property!(
            spa::param::format::FormatProperties::MediaSubtype,
            Id,
            MediaSubtype::Raw
        ),
        spa::pod::property!(
            spa::param::format::FormatProperties::VideoFormat,
            Choice,
            Enum,
            Id,
            spa::param::video::VideoFormat::BGRx,
            spa::param::video::VideoFormat::BGRx,
            spa::param::video::VideoFormat::BGRA,
            spa::param::video::VideoFormat::RGBx,
            spa::param::video::VideoFormat::RGBA
        ),
        spa::pod::property!(
            spa::param::format::FormatProperties::VideoSize,
            Choice,
            Range,
            Rectangle,
            spa::utils::Rectangle {
                width: 1920,
                height: 1080
            },
            spa::utils::Rectangle {
                width: 1,
                height: 1
            },
            spa::utils::Rectangle {
                width: super::MAX_VIDEO_DIMENSION,
                height: super::MAX_VIDEO_DIMENSION,
            }
        ),
        spa::pod::property!(
            spa::param::format::FormatProperties::VideoFramerate,
            Choice,
            Range,
            Fraction,
            spa::utils::Fraction { num: 60, denom: 1 },
            spa::utils::Fraction { num: 0, denom: 1 },
            spa::utils::Fraction { num: 240, denom: 1 }
        ),
    )
}

pub(super) fn format_parameter() -> Result<Vec<u8>, CaptureError> {
    serialize_object(format_object())
}

pub(super) fn dma_buf_format_parameter() -> Result<Vec<u8>, CaptureError> {
    let mut object = format_object();
    object.properties.push(spa::pod::Property {
        key: spa::sys::SPA_FORMAT_VIDEO_modifier,
        flags: PropertyFlags::MANDATORY | PropertyFlags::DONT_FIXATE,
        value: Value::Choice(ChoiceValue::Long(Choice(
            ChoiceFlags::empty(),
            ChoiceEnum::Range {
                default: 0,
                min: 0,
                max: i64::MAX,
            },
        ))),
    });
    serialize_object(object)
}

pub(super) fn fixate_modifier_parameter(
    param: &Pod,
    modifier: u64,
) -> Result<Vec<u8>, CaptureError> {
    let (_, value) = PodDeserializer::deserialize_any_from(param.as_bytes())
        .map_err(|error| format_error(format!("{error:?}")))?;
    let Value::Object(mut object) = value else {
        return Err(format_error("negotiated format is not an object pod"));
    };
    let property = object
        .properties
        .iter_mut()
        .find(|property| property.key == spa::sys::SPA_FORMAT_VIDEO_modifier)
        .ok_or_else(|| format_error("negotiated DMA-BUF format has no modifier"))?;
    property.flags.remove(PropertyFlags::DONT_FIXATE);
    property.flags.insert(PropertyFlags::MANDATORY);
    property.value = Value::Long(modifier as i64);
    serialize_object(object)
}

pub(super) fn buffer_parameter(format: NegotiatedFormat) -> Result<Vec<u8>, CaptureError> {
    let stride = i32::try_from(
        format
            .width
            .checked_mul(4)
            .ok_or_else(|| format_error("negotiated stride overflows"))?,
    )
    .map_err(|_| format_error("negotiated stride exceeds PipeWire limits"))?;
    let size = stride
        .checked_mul(i32::try_from(format.height).map_err(|_| format_error("height too large"))?)
        .ok_or_else(|| format_error("negotiated buffer size overflows"))?;
    let memory_mask = if format.modifier.is_some() {
        1_i32 << spa::sys::SPA_DATA_DmaBuf
    } else {
        (1_i32 << spa::sys::SPA_DATA_MemPtr) | (1_i32 << spa::sys::SPA_DATA_MemFd)
    };
    let mut properties = vec![
        // KWin offers 2–4 buffers. Eight is a preference, not a requirement;
        // keep the existing upper bound while allowing the producer's pool.
        spa::pod::Property::new(
            spa::sys::SPA_PARAM_BUFFERS_buffers,
            Value::Choice(ChoiceValue::Int(Choice(
                ChoiceFlags::empty(),
                ChoiceEnum::Range {
                    default: 8,
                    min: 2,
                    max: 8,
                },
            ))),
        ),
        spa::pod::Property::new(
            spa::sys::SPA_PARAM_BUFFERS_blocks,
            if format.modifier.is_some() {
                Value::Choice(ChoiceValue::Int(Choice(
                    ChoiceFlags::empty(),
                    ChoiceEnum::Range {
                        default: 1,
                        min: 1,
                        max: 4,
                    },
                )))
            } else {
                Value::Int(1)
            },
        ),
    ];
    properties.extend([
        spa::pod::Property::new(spa::sys::SPA_PARAM_BUFFERS_size, Value::Int(size)),
        spa::pod::Property::new(spa::sys::SPA_PARAM_BUFFERS_stride, Value::Int(stride)),
    ]);
    properties.push(spa::pod::Property::new(
        spa::sys::SPA_PARAM_BUFFERS_dataType,
        Value::Int(memory_mask),
    ));
    let buffer = spa::pod::Object {
        type_: spa::utils::SpaTypes::ObjectParamBuffers.as_raw(),
        id: ParamType::Buffers.as_raw(),
        properties,
    };
    serialize_object(buffer)
}

pub(super) fn update_buffer_params(
    stream: &pw::stream::Stream,
    format: NegotiatedFormat,
) -> Result<(), CaptureError> {
    let mut bytes = vec![buffer_parameter(format)?, cursor_meta_parameter()?];
    let metas = [
        (
            spa::sys::SPA_META_Header,
            size_of::<spa::sys::spa_meta_header>(),
        ),
        (
            spa::sys::SPA_META_VideoCrop,
            size_of::<spa::sys::spa_meta_region>(),
        ),
        (
            spa::sys::SPA_META_VideoTransform,
            size_of::<spa::sys::spa_meta_videotransform>(),
        ),
    ];
    for (meta_type, meta_size) in metas {
        let size = i32::try_from(meta_size).map_err(format_error)?;
        bytes.push(meta_parameter(meta_type, Value::Int(size))?);
    }
    let mut params = bytes
        .iter()
        .map(|bytes| {
            Pod::from_bytes(bytes)
                .ok_or_else(|| format_error("failed to build PipeWire buffer parameter"))
        })
        .collect::<Result<Vec<_>, _>>()?;
    stream.update_params(&mut params).map_err(pipewire_error)
}

pub(super) fn cursor_meta_parameter() -> Result<Vec<u8>, CaptureError> {
    let size = |dimension| i32::try_from(cursor_meta_size(dimension)).map_err(format_error);
    let value = Value::Choice(ChoiceValue::Int(Choice(
        ChoiceFlags::empty(),
        ChoiceEnum::Range {
            default: size(PREFERRED_CURSOR_DIMENSION)?,
            min: size(MIN_CURSOR_DIMENSION)?,
            max: size(MAX_CURSOR_DIMENSION)?,
        },
    )));
    meta_parameter(spa::sys::SPA_META_Cursor, value)
}

fn meta_parameter(meta_type: u32, size: Value) -> Result<Vec<u8>, CaptureError> {
    serialize_object(spa::pod::Object {
        type_: spa::utils::SpaTypes::ObjectParamMeta.as_raw(),
        id: ParamType::Meta.as_raw(),
        properties: vec![
            spa::pod::Property::new(
                spa::sys::SPA_PARAM_META_type,
                Value::Id(spa::utils::Id(meta_type)),
            ),
            spa::pod::Property::new(spa::sys::SPA_PARAM_META_size, size),
        ],
    })
}

fn serialize_object(object: spa::pod::Object) -> Result<Vec<u8>, CaptureError> {
    PodSerializer::serialize(Cursor::new(Vec::new()), &Value::Object(object))
        .map(|(cursor, _)| cursor.into_inner())
        .map_err(|error| format_error(error.to_string()))
}
