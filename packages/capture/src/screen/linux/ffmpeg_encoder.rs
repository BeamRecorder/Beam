use std::path::PathBuf;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum FfmpegAcceleration {
    Software,
    Qsv,
    Vaapi { device: PathBuf },
    Nvenc,
    Amf,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct FfmpegEncoder {
    pub(crate) name: String,
    pub(crate) codec: String,
    pub(crate) acceleration: FfmpegAcceleration,
}

impl FfmpegEncoder {
    pub(crate) fn software(name: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            codec: "h264".into(),
            acceleration: FfmpegAcceleration::Software,
        }
    }

    pub(crate) fn filter(&self) -> &'static str {
        match self.acceleration {
            FfmpegAcceleration::Vaapi { .. } => {
                "pad=ceil(iw/2)*2:ceil(ih/2)*2,format=nv12,hwupload"
            }
            FfmpegAcceleration::Software => "pad=ceil(iw/2)*2:ceil(ih/2)*2",
            _ => "pad=ceil(iw/2)*2:ceil(ih/2)*2,format=nv12",
        }
    }

    pub(crate) fn device_arguments(&self) -> Vec<String> {
        match &self.acceleration {
            FfmpegAcceleration::Vaapi { device } => vec![
                "-vaapi_device".into(),
                device.to_string_lossy().into_owned(),
            ],
            _ => Vec::new(),
        }
    }

    pub(crate) fn output_pixel_format(&self) -> Option<&'static str> {
        matches!(self.acceleration, FfmpegAcceleration::Software).then_some("yuv420p")
    }

    pub(crate) fn is_hardware(&self) -> bool {
        !matches!(self.acceleration, FfmpegAcceleration::Software)
    }
}
