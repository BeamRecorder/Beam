use wasapi::{DeviceEnumerator, Direction, initialize_mta};

use crate::{
    CaptureError,
    model::{
        MediaFormat, SourceCapabilities, SourceDescriptor, SourceId, SourceKind,
        SourceSelectionMode,
    },
};

pub fn discover_outputs() -> Result<Vec<SourceDescriptor>, CaptureError> {
    // WGC enumeration may already have initialized this probing thread as STA.
    // Core Audio works in either apartment, so RPC_E_CHANGED_MODE is harmless here.
    let _apartment = initialize_mta();
    let enumerator = DeviceEnumerator::new().map_err(backend_error)?;
    let default_id = enumerator
        .get_default_device(&Direction::Render)
        .and_then(|device| device.get_id())
        .ok();
    let collection = enumerator
        .get_device_collection(&Direction::Render)
        .map_err(backend_error)?;
    (&collection)
        .into_iter()
        .map(|device| {
            let device = device.map_err(backend_error)?;
            let id = device.get_id().map_err(backend_error)?;
            let label = device.get_friendlyname().map_err(backend_error)?;
            let client = device.get_iaudioclient().map_err(backend_error)?;
            let format = client.get_mixformat().map_err(backend_error)?;
            Ok(SourceDescriptor {
                id: SourceId::new(format!("wasapi:output:{id}"))?,
                kind: SourceKind::SystemAudio,
                label,
                is_default: default_id.as_ref() == Some(&id),
                selection_mode: SourceSelectionMode::Direct,
                capabilities: SourceCapabilities {
                    formats: vec![MediaFormat::Audio {
                        sample_rate: format.get_samplespersec(),
                        channels: format.get_nchannels(),
                        sample_format: "f32-loopback".into(),
                    }],
                    ..SourceCapabilities::default()
                },
            })
        })
        .collect()
}

fn backend_error(error: impl std::fmt::Display) -> CaptureError {
    CaptureError::Backend(format!("WASAPI output discovery failed: {error}"))
}
