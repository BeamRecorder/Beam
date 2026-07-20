use crate::model::{
    MediaFormat, SourceCapabilities, SourceDescriptor, SourceId, SourceKind, SourceSelectionMode,
};
use cpal::traits::{DeviceTrait, HostTrait};
pub fn discover_microphones() -> Result<Vec<SourceDescriptor>, crate::CaptureError> {
    let host = cpal::default_host();
    let default_id = host
        .default_input_device()
        .and_then(|device| device.id().ok());
    let devices = host
        .input_devices()
        .map_err(|e| crate::CaptureError::Backend(e.to_string()))?;
    devices
        .map(|device| {
            let name = device.to_string();
            let native_id = device
                .id()
                .map_err(|error| crate::CaptureError::Backend(error.to_string()))?;
            let formats = device
                .supported_input_configs()
                .map_err(|e| crate::CaptureError::Backend(e.to_string()))?
                .map(|config| MediaFormat::Audio {
                    sample_rate: config.max_sample_rate(),
                    channels: config.channels(),
                    sample_format: config.sample_format().to_string(),
                })
                .collect();
            Ok(SourceDescriptor {
                id: SourceId::new(format!("cpal:{native_id}"))?,
                kind: SourceKind::Microphone,
                label: name.clone(),
                is_default: default_id.as_ref() == Some(&native_id),
                selection_mode: SourceSelectionMode::Direct,
                capabilities: SourceCapabilities {
                    formats,
                    ..SourceCapabilities::default()
                },
            })
        })
        .collect()
}
