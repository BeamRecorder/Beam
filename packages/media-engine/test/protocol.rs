use beam_media_engine::{
    API_VERSION, ProjectId,
    protocol::{Command, Config, Request},
};
use serde_json::json;
#[test]
fn four_source_config_round_trips_and_preserves_native_ids() {
    let config = json!({
        "projectId": ProjectId::new(), "output":"project-root",
        "screen": {"selection":{"mode":"portal","kind":"window","restoreToken":null},"region":{"x":0.1,"y":0.2,"width":0.8,"height":0.7},"cursor":{"mode":"disabled"},"fps":30,"excludedWindowHandles":[]},
        "camera":{"mode":"device","deviceId":"native-camera","width":640,"height":480,"fps":30},
        "microphone":{"mode":"device","deviceId":"native-microphone"},"systemAudio":{"mode":"default"}
    });
    let parsed: Config = serde_json::from_value(config.clone()).unwrap();
    assert_eq!(serde_json::to_value(&parsed).unwrap(), config);
    let request: Request = serde_json::from_value(
        json!({"version":API_VERSION,"id":"one","command":{"type":"prepare","config":config}}),
    )
    .unwrap();
    assert!(matches!(request.command, Command::Prepare { .. }));
}
#[test]
fn boundary_rejects_legacy_commands_arbitrary_paths_and_invalid_ids() {
    for command in [
        json!({"type":"native-media-start"}),
        json!({"type":"start","sessionId":"invalid"}),
        json!({"type":"status","outputDir":"/tmp/escape"}),
    ] {
        assert!(
            serde_json::from_value::<Request>(json!({"version":1,"id":"test","command":command}))
                .is_err()
        );
    }
}

#[test]
fn configuration_conversion_keeps_disabled_default_and_explicit_devices_distinct() {
    use beam_media_engine::{AudioSelection, CameraSelection, RecordingConfig};
    for (camera, audio) in [
        (json!({"mode":"disabled"}), json!({"mode":"disabled"})),
        (
            json!({"mode":"default","width":640,"height":480,"fps":30}),
            json!({"mode":"default"}),
        ),
        (
            json!({"mode":"device","deviceId":"camera","width":1280,"height":720,"fps":60}),
            json!({"mode":"device","deviceId":"microphone"}),
        ),
    ] {
        let mode = camera["mode"].as_str().unwrap();
        let config:Config=serde_json::from_value(json!({"projectId":ProjectId::new(),"screen":null,"camera":camera,"microphone":audio,"systemAudio":{"mode":"disabled"}})).unwrap();
        let native: RecordingConfig = config.into();
        match mode {
            "disabled" => assert!(matches!(
                (native.camera, native.microphone),
                (CameraSelection::Disabled, AudioSelection::Disabled)
            )),
            "default" => assert!(matches!(
                (native.camera, native.microphone),
                (
                    CameraSelection::FirstAvailable {
                        width: 640,
                        height: 480,
                        fps: 30
                    },
                    AudioSelection::Default
                )
            )),
            _ => {
                assert!(
                    matches!(native.camera,CameraSelection::Device(request) if request.device_id=="camera" && request.width==1280)
                );
                assert!(matches!(native.microphone,AudioSelection::Device(id) if id=="microphone"));
            }
        }
        assert!(matches!(native.system_audio, AudioSelection::Disabled));
    }
}
