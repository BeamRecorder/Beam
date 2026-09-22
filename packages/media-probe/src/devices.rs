use std::error::Error;

use beam_audio::{AudioDevice, AudioError};
use beam_camera::{CameraDevice, CameraError};

pub fn run() -> Result<(), Box<dyn Error>> {
    let catalog = catalog(
        beam_camera::list_cameras(),
        beam_audio::list_inputs(),
        beam_audio::list_system_outputs(),
    );
    println!("{}", serde_json::to_string_pretty(&catalog)?);
    Ok(())
}

fn catalog(
    cameras: Result<Vec<CameraDevice>, CameraError>,
    microphones: Result<Vec<AudioDevice>, AudioError>,
    system_outputs: Result<Vec<AudioDevice>, AudioError>,
) -> serde_json::Value {
    let errors = serde_json::json!({
        "cameras": cameras.as_ref().err().map(ToString::to_string),
        "microphones": microphones.as_ref().err().map(ToString::to_string),
        "systemOutputs": system_outputs.as_ref().err().map(ToString::to_string),
    });
    let cameras = cameras
        .unwrap_or_default()
        .into_iter()
        .map(|device| serde_json::json!({"id": device.id, "name": device.name}))
        .collect::<Vec<_>>();
    let microphones = microphones
        .unwrap_or_default()
        .into_iter()
        .map(|device| {
            serde_json::json!({
                "id": device.id, "name": device.name, "default": device.is_default
            })
        })
        .collect::<Vec<_>>();
    let system_outputs = system_outputs
        .unwrap_or_default()
        .into_iter()
        .map(|device| {
            serde_json::json!({
                "id": device.id, "name": device.name, "default": device.is_default
            })
        })
        .collect::<Vec<_>>();
    serde_json::json!({
        "cameras": cameras,
        "microphones": microphones,
        "systemOutputs": system_outputs,
        "errors": errors,
    })
}

#[path = "../test/devices_internal.rs"]
mod device_checks;
