use std::{io::Cursor, mem::size_of};

use pipewire::{self as pw, spa};
use spa::{
    param::{ParamType, format::MediaSubtype, format::MediaType, video::VideoInfoRaw},
    pod::{Pod, Value},
};

use crate::CaptureError;

use super::{NativePixelFormat, NegotiatedFormat, format_error, pipewire_error};

// Mutter advertises SPA_META_Cursor with room for a 384 x 384 RGBA bitmap.
// SPA_PARAM_META_size is negotiated as a fixed value, so asking for a smaller
// block does not merely truncate the bitmap: the Cursor meta is omitted from
// the allocated buffers altogether.
const MAX_CURSOR_DIMENSION: usize = 384;
pub(super) const CURSOR_META_SIZE: usize = size_of::<spa::sys::spa_meta_cursor>()
    + size_of::<spa::sys::spa_meta_bitmap>()
    + MAX_CURSOR_DIMENSION * MAX_CURSOR_DIMENSION * 4;

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
    NegotiatedFormat::new(raw.size().width, raw.size().height, pixel_format)
        .map_err(|error| format_error(error.to_string()))
}

pub(super) fn parse_format_event(
    param: Option<&Pod>,
) -> Result<Option<NegotiatedFormat>, CaptureError> {
    param.map(parse_format).transpose()
}

pub(super) fn format_parameter() -> Result<Vec<u8>, CaptureError> {
    let object = spa::pod::object!(
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
    );
    serialize_object(object)
}

pub(super) fn update_buffer_params(
    stream: &pw::stream::Stream,
    format: NegotiatedFormat,
) -> Result<(), CaptureError> {
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
    let memory_mask = (1_i32 << spa::sys::SPA_DATA_MemPtr) | (1_i32 << spa::sys::SPA_DATA_MemFd);
    let buffer = spa::pod::Object {
        type_: spa::utils::SpaTypes::ObjectParamBuffers.as_raw(),
        id: ParamType::Buffers.as_raw(),
        properties: vec![
            spa::pod::Property::new(spa::sys::SPA_PARAM_BUFFERS_buffers, Value::Int(8)),
            spa::pod::Property::new(spa::sys::SPA_PARAM_BUFFERS_blocks, Value::Int(1)),
            spa::pod::Property::new(spa::sys::SPA_PARAM_BUFFERS_size, Value::Int(size)),
            spa::pod::Property::new(spa::sys::SPA_PARAM_BUFFERS_stride, Value::Int(stride)),
            spa::pod::Property::new(
                spa::sys::SPA_PARAM_BUFFERS_dataType,
                Value::Int(memory_mask),
            ),
        ],
    };
    let metas = [
        (
            spa::sys::SPA_META_Header,
            size_of::<spa::sys::spa_meta_header>(),
        ),
        (spa::sys::SPA_META_Cursor, CURSOR_META_SIZE),
        (
            spa::sys::SPA_META_VideoCrop,
            size_of::<spa::sys::spa_meta_region>(),
        ),
        (
            spa::sys::SPA_META_VideoTransform,
            size_of::<spa::sys::spa_meta_videotransform>(),
        ),
    ];
    let mut bytes = vec![serialize_object(buffer)?];
    for (meta_type, meta_size) in metas {
        let meta = spa::pod::Object {
            type_: spa::utils::SpaTypes::ObjectParamMeta.as_raw(),
            id: ParamType::Meta.as_raw(),
            properties: vec![
                spa::pod::Property::new(
                    spa::sys::SPA_PARAM_META_type,
                    Value::Id(spa::utils::Id(meta_type)),
                ),
                spa::pod::Property::new(
                    spa::sys::SPA_PARAM_META_size,
                    Value::Int(i32::try_from(meta_size).map_err(format_error)?),
                ),
            ],
        };
        bytes.push(serialize_object(meta)?);
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

fn serialize_object(object: spa::pod::Object) -> Result<Vec<u8>, CaptureError> {
    spa::pod::serialize::PodSerializer::serialize(Cursor::new(Vec::new()), &Value::Object(object))
        .map(|(cursor, _)| cursor.into_inner())
        .map_err(|error| format_error(error.to_string()))
}
