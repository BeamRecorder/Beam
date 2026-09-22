#![cfg(test)]

use super::{FfmpegAcceleration, FfmpegEncoder};
use std::path::PathBuf;

#[test]
fn software_and_hardware_encoders_choose_distinct_filters_and_arguments() {
    let software = FfmpegEncoder::software("libx264");
    assert_eq!(software.name, "libx264");
    assert_eq!(software.codec, "h264");
    assert_eq!(software.filter(), "pad=ceil(iw/2)*2:ceil(ih/2)*2");
    assert_eq!(software.output_pixel_format(), Some("yuv420p"));
    assert!(!software.is_hardware());
    assert!(software.device_arguments().is_empty());

    let vaapi = FfmpegEncoder {
        name: "h264_vaapi".into(),
        codec: "h264".into(),
        acceleration: FfmpegAcceleration::Vaapi {
            device: PathBuf::from("/dev/dri/renderD128"),
        },
    };
    assert_eq!(
        vaapi.filter(),
        "pad=ceil(iw/2)*2:ceil(ih/2)*2,format=nv12,hwupload"
    );
    assert_eq!(
        vaapi.device_arguments(),
        ["-vaapi_device", "/dev/dri/renderD128"]
    );
    assert_eq!(vaapi.output_pixel_format(), None);
    assert!(vaapi.is_hardware());

    for acceleration in [
        FfmpegAcceleration::Qsv,
        FfmpegAcceleration::Nvenc,
        FfmpegAcceleration::Amf,
    ] {
        let encoder = FfmpegEncoder {
            acceleration,
            ..software.clone()
        };
        assert_eq!(
            encoder.filter(),
            "pad=ceil(iw/2)*2:ceil(ih/2)*2,format=nv12"
        );
        assert!(encoder.is_hardware());
        assert!(encoder.device_arguments().is_empty());
    }
}
