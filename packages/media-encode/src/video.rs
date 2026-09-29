//! Recording profiles chosen from the formats actually supported by the encoder.
use gst::prelude::*;

use crate::{EncodeError, VideoConfig, VideoEncoding};

/// Chooses a hardware VP9 profile when the device supports the original dimensions.
/// VP8 remains a supported recording profile on devices without WebM hardware.
pub(crate) fn select(config: VideoConfig) -> Result<VideoEncoding, EncodeError> {
    let raw = |format: &str| {
        gst::Caps::builder("video/x-raw")
            .field("format", format)
            .field("width", config.width as i32)
            .field("height", config.height as i32)
            .field("framerate", gst::Fraction::new(config.fps as i32, 1))
            .build()
    };
    select_with(|name, format| {
        // oneVPL advertises 16 px caps, but Intel VP9 rejects dimensions below 128 × 96.
        // Select a supported profile before streaming; never retry a failed encoder.
        if name == "qsvvp9enc" && (config.width < 128 || config.height < 96) {
            return false;
        }
        gst::ElementFactory::find(name).is_some_and(|factory| {
            factory.static_pad_templates().iter().any(|pad| {
                pad.direction() == gst::PadDirection::Sink && pad.caps().can_intersect(&raw(format))
            })
        })
    })
    .ok_or_else(|| {
        EncodeError::Pipeline("no recording encoder supports the source dimensions".into())
    })
}

pub(crate) fn select_with(mut accepts: impl FnMut(&str, &str) -> bool) -> Option<VideoEncoding> {
    [
        VideoEncoding {
            factory: "vavp9enc",
            codec: "vp9",
            pixel_format: "VUYA",
        },
        VideoEncoding {
            factory: "qsvvp9enc",
            codec: "vp9",
            pixel_format: "NV12",
        },
        VideoEncoding {
            factory: "vp8enc",
            codec: "vp8",
            pixel_format: "I420",
        },
    ]
    .into_iter()
    .find(|profile| accepts(profile.factory, profile.pixel_format))
}

/// Configures bounded latency and explicit quality; no encoder may resize or drop frames.
pub(crate) fn configure(
    encoder: &gst::Element,
    config: VideoConfig,
    profile: VideoEncoding,
) -> Result<(), EncodeError> {
    match profile.factory {
        "vavp9enc" => {
            encoder.set_property_from_str("rate-control", "cqp");
            encoder.set_property("qp", 30_u32);
            encoder.set_property("target-usage", 4_u32);
            encoder.set_property("hierarchical-level", 1_u32);
            encoder.set_property("key-int-max", config.fps.saturating_mul(2).min(1024));
        }
        "qsvvp9enc" => {
            encoder.set_property_from_str("rate-control", "cqp");
            encoder.set_property("qp-i", 30_u32);
            encoder.set_property("qp-p", 30_u32);
            encoder.set_property("low-latency", true);
            encoder.set_property(
                "gop-size",
                config.fps.saturating_mul(2).min(i32::MAX as u32),
            );
        }
        "vp8enc" => {
            encoder.set_property("deadline", 1_i64);
            encoder.set_property("cpu-used", 4_i32);
            encoder.set_property("threads", 4_i32);
            encoder.set_property_from_str("end-usage", "cq");
            encoder.set_property("cq-level", 8_i32);
            encoder.set_property("min-quantizer", 0_i32);
            encoder.set_property("max-quantizer", 24_i32);
            encoder.set_property("target-bitrate", bitrate(config));
            encoder.set_property("static-threshold", 100_i32);
            encoder.set_property(
                "keyframe-max-dist",
                config.fps.saturating_mul(2).min(i32::MAX as u32) as i32,
            );
            encoder.set_property("resize-allowed", false);
            encoder.set_property("dropframe-threshold", 0_i32);
        }
        _ => return Err(EncodeError::Pipeline("unknown recording profile".into())),
    }
    Ok(())
}

/// Resolution and cadence scale the bitrate budget, including high-DPI screens.
pub(crate) fn bitrate(config: VideoConfig) -> i32 {
    (u64::from(config.width)
        .saturating_mul(u64::from(config.height))
        .saturating_mul(u64::from(config.fps))
        .saturating_mul(18)
        / 100)
        .clamp(1_000_000, i32::MAX as u64) as i32
}
