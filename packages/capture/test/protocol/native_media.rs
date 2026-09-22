#![cfg(test)]

use super::{NativeAudioSelection, NativeCameraSelection, NativeMediaConfig};

#[test]
fn native_media_selection_round_trips_through_json() -> Result<(), Box<dyn std::error::Error>> {
    let config = NativeMediaConfig {
        output_dir: "/tmp/beam-native-session".into(),
        camera: NativeCameraSelection::Device {
            id: "camera-1".into(),
            width: 1280,
            height: 720,
            fps: 30,
        },
        microphone: NativeAudioSelection::Default,
        system_audio: NativeAudioSelection::Device {
            id: "output-1".into(),
        },
    };

    let encoded = serde_json::to_value(&config)?;
    assert_eq!(encoded["outputDir"], "/tmp/beam-native-session");
    assert_eq!(encoded["camera"]["mode"], "device");
    assert_eq!(encoded["systemAudio"]["id"], "output-1");
    assert_eq!(
        serde_json::from_value::<NativeMediaConfig>(encoded)?,
        config
    );
    Ok(())
}

#[test]
fn native_media_selection_rejects_unknown_modes() {
    let encoded = serde_json::json!({
        "outputDir": "/tmp/beam-native-session",
        "camera": { "mode": "unsupported" },
        "microphone": { "mode": "disabled" },
        "systemAudio": { "mode": "disabled" }
    });
    assert!(serde_json::from_value::<NativeMediaConfig>(encoded).is_err());
}

#[test]
fn native_media_selection_rejects_missing_and_unknown_configuration_fields() {
    let valid = serde_json::json!({
        "outputDir": "session",
        "camera": { "mode": "disabled" },
        "microphone": { "mode": "disabled" },
        "systemAudio": { "mode": "disabled" }
    });
    for missing in ["outputDir", "camera", "microphone", "systemAudio"] {
        let mut malformed = valid.clone();
        if let Some(object) = malformed.as_object_mut() {
            object.remove(missing);
        }
        assert!(
            serde_json::from_value::<NativeMediaConfig>(malformed).is_err(),
            "{missing}"
        );
    }
    let mut unknown = valid;
    unknown["unexpected"] = serde_json::json!(true);
    assert!(serde_json::from_value::<NativeMediaConfig>(unknown).is_err());
}

#[test]
fn every_camera_and_audio_mode_round_trips() -> Result<(), Box<dyn std::error::Error>> {
    let cameras = [
        NativeCameraSelection::Disabled,
        NativeCameraSelection::FirstAvailable {
            width: 1,
            height: 1,
            fps: 1,
        },
        NativeCameraSelection::Device {
            id: "camera ü".into(),
            width: u32::MAX,
            height: 2,
            fps: 120,
        },
    ];
    let audio = [
        NativeAudioSelection::Disabled,
        NativeAudioSelection::Default,
        NativeAudioSelection::Device {
            id: "output ü".into(),
        },
    ];
    for camera in cameras {
        let encoded = serde_json::to_value(&camera)?;
        assert_eq!(
            serde_json::from_value::<NativeCameraSelection>(encoded)?,
            camera
        );
    }
    for selection in audio {
        let encoded = serde_json::to_value(&selection)?;
        assert_eq!(
            serde_json::from_value::<NativeAudioSelection>(encoded)?,
            selection
        );
    }
    Ok(())
}
