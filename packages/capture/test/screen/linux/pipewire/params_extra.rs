#![cfg(test)]
#![allow(clippy::expect_used, clippy::panic)]

use super::*;
use spa::param::format::{MediaSubtype, MediaType};

fn raw_video_pod(
    media_type: MediaType,
    media_subtype: MediaSubtype,
    format: spa::param::video::VideoFormat,
    width: u32,
    height: u32,
) -> Vec<u8> {
    serialized(Value::Object(spa::pod::object!(
        SpaTypes::ObjectParamFormat,
        ParamType::EnumFormat,
        spa::pod::property!(
            spa::param::format::FormatProperties::MediaType,
            Id,
            media_type
        ),
        spa::pod::property!(
            spa::param::format::FormatProperties::MediaSubtype,
            Id,
            media_subtype
        ),
        spa::pod::property!(
            spa::param::format::FormatProperties::VideoFormat,
            Id,
            format
        ),
        spa::pod::property!(
            spa::param::format::FormatProperties::VideoSize,
            Rectangle,
            spa::utils::Rectangle { width, height }
        ),
    )))
}

#[test]
fn parses_every_supported_raw_video_format_and_preserves_dimensions() {
    for (video_format, expected) in [
        (
            spa::param::video::VideoFormat::BGRx,
            NativePixelFormat::Bgrx,
        ),
        (
            spa::param::video::VideoFormat::BGRA,
            NativePixelFormat::Bgra,
        ),
        (
            spa::param::video::VideoFormat::RGBx,
            NativePixelFormat::Rgbx,
        ),
        (
            spa::param::video::VideoFormat::RGBA,
            NativePixelFormat::Rgba,
        ),
    ] {
        let bytes = raw_video_pod(MediaType::Video, MediaSubtype::Raw, video_format, 321, 123);
        let aligned = AlignedBytes::<POD_STORAGE_SIZE>::from_bytes(&bytes);
        let parsed = parse_format(aligned.pod()).expect("supported raw video");
        assert_eq!(parsed.width, 321);
        assert_eq!(parsed.height, 123);
        assert_eq!(parsed.pixel_format, expected);
    }
}

#[test]
fn rejects_non_video_non_raw_and_unsupported_raw_pixels() {
    let cases = [
        (
            MediaType::Audio,
            MediaSubtype::Raw,
            spa::param::video::VideoFormat::BGRA,
            "non-raw video",
        ),
        (
            MediaType::Video,
            MediaSubtype::Mjpg,
            spa::param::video::VideoFormat::BGRA,
            "non-raw video",
        ),
        (
            MediaType::Video,
            MediaSubtype::Raw,
            spa::param::video::VideoFormat::YV12,
            "unsupported raw",
        ),
    ];
    for (media_type, subtype, format, reason) in cases {
        let bytes = raw_video_pod(media_type, subtype, format, 2, 2);
        let aligned = AlignedBytes::<POD_STORAGE_SIZE>::from_bytes(&bytes);
        let error = parse_format(aligned.pod()).expect_err("unsupported negotiated format");
        assert!(error.to_string().contains(reason), "{error}");
    }
}

#[test]
fn rejects_zero_and_oversized_negotiated_video_dimensions() {
    for (width, height) in [(0, 2), (2, 0), (1_000_000, 2)] {
        let bytes = raw_video_pod(
            MediaType::Video,
            MediaSubtype::Raw,
            spa::param::video::VideoFormat::BGRA,
            width,
            height,
        );
        let aligned = AlignedBytes::<POD_STORAGE_SIZE>::from_bytes(&bytes);
        assert!(parse_format(aligned.pod()).is_err());
    }
}

#[test]
fn rejects_malformed_and_incomplete_format_pods_without_panicking() {
    let wrong_type = serialized(Value::Int(123));
    let aligned = AlignedBytes::<POD_STORAGE_SIZE>::from_bytes(&wrong_type);
    assert!(parse_format(aligned.pod()).is_err());

    let incomplete = serialized(Value::Object(spa::pod::object!(
        SpaTypes::ObjectParamFormat,
        ParamType::EnumFormat,
        spa::pod::property!(
            spa::param::format::FormatProperties::MediaType,
            Id,
            MediaType::Video
        ),
    )));
    let aligned = AlignedBytes::<POD_STORAGE_SIZE>::from_bytes(&incomplete);
    assert!(parse_format(aligned.pod()).is_err());
}

#[test]
fn format_caps_advertise_all_supported_pixels_and_bounded_geometry() {
    let bytes = format_parameter().expect("format caps");
    let object = decoded_object(&bytes);
    assert_eq!(object.type_, SpaTypes::ObjectParamFormat.as_raw());
    assert_eq!(object.id, ParamType::EnumFormat.as_raw());
    assert_eq!(
        property(&object, spa::sys::SPA_FORMAT_mediaType),
        &Value::Id(spa::utils::Id(MediaType::Video.as_raw()))
    );
    assert_eq!(
        property(&object, spa::sys::SPA_FORMAT_mediaSubtype),
        &Value::Id(spa::utils::Id(MediaSubtype::Raw.as_raw()))
    );
    let formats = property(&object, spa::sys::SPA_FORMAT_VIDEO_format);
    let Value::Choice(ChoiceValue::Id(Choice(
        _,
        ChoiceEnum::Enum {
            default,
            alternatives,
        },
    ))) = formats
    else {
        panic!("expected enumerated pixel formats: {formats:?}");
    };
    let expected = [
        spa::utils::Id(spa::param::video::VideoFormat::BGRx.as_raw()),
        spa::utils::Id(spa::param::video::VideoFormat::BGRA.as_raw()),
        spa::utils::Id(spa::param::video::VideoFormat::RGBx.as_raw()),
        spa::utils::Id(spa::param::video::VideoFormat::RGBA.as_raw()),
    ];
    assert_eq!(*default, expected[0]);
    for format in expected {
        assert!(format == *default || alternatives.contains(&format));
    }
    let size = property(&object, spa::sys::SPA_FORMAT_VIDEO_size);
    assert!(matches!(
        size,
        Value::Choice(ChoiceValue::Rectangle(Choice(
            _,
            ChoiceEnum::Range { default, min, max }
        ))) if *default == (spa::utils::Rectangle { width: 1920, height: 1080 })
            && *min == (spa::utils::Rectangle { width: 1, height: 1 })
            && *max == (spa::utils::Rectangle {
                width: MAX_VIDEO_DIMENSION,
                height: MAX_VIDEO_DIMENSION,
            })
    ));
    let fps = property(&object, spa::sys::SPA_FORMAT_VIDEO_framerate);
    assert!(matches!(
        fps,
        Value::Choice(ChoiceValue::Fraction(Choice(
            _,
            ChoiceEnum::Range { default, min, max }
        ))) if *default == (spa::utils::Fraction { num: 60, denom: 1 })
            && *min == (spa::utils::Fraction { num: 0, denom: 1 })
            && *max == (spa::utils::Fraction { num: 240, denom: 1 })
    ));
}

#[test]
fn buffer_size_accepts_maximum_i32_stride_but_rejects_next_width_and_height() {
    let max_width = (i32::MAX as u32) / 4;
    let format = NegotiatedFormat {
        width: max_width,
        height: 1,
        pixel_format: NativePixelFormat::Bgra,
    };
    let object = decoded_object(&buffer_parameter(format).expect("largest stride"));
    assert_eq!(
        property(&object, spa::sys::SPA_PARAM_BUFFERS_stride),
        &Value::Int(i32::try_from(max_width * 4).expect("stride"))
    );
    let too_wide = NegotiatedFormat {
        width: max_width + 1,
        ..format
    };
    assert!(
        buffer_parameter(too_wide)
            .expect_err("stride too large")
            .to_string()
            .contains("PipeWire limits")
    );
    let too_tall = NegotiatedFormat {
        width: 1,
        height: i32::MAX as u32 + 1,
        ..format
    };
    assert!(
        buffer_parameter(too_tall)
            .expect_err("height too large")
            .to_string()
            .contains("height too large")
    );
}
