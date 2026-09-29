use super::*;
use serde_json::json;

fn request() -> Value {
    json!({ "mode":"recorder", "sourceMode":"display", "sourceId":"x11:monitor:1:0", "cameraId":null,
        "microphoneId":null, "systemAudioId":null })
}

#[test]
fn video_editor_requests_use_the_argui_process_with_a_validated_project_id() {
    let project = ProjectId::new();
    assert_eq!(
        editor_argument(json!({ "projectId": project, "mode": "video" })).unwrap(),
        format!("--editor={project}")
    );
}

#[test]
fn screenshot_editor_requests_never_fall_through_to_a_legacy_process() {
    let error = editor_argument(json!({ "projectId": ProjectId::new(), "mode": "screenshot" }))
        .unwrap_err();
    assert!(error.contains("native Argui app") && error.contains("remains saved"));
}

#[test]
fn editor_arguments_reject_invalid_ids_modes_and_unexpected_process_arguments() {
    for payload in [
        json!({ "projectId": "../project", "mode": "video" }),
        json!({ "projectId": ProjectId::new(), "mode": "invalid" }),
        json!({ "projectId": ProjectId::new(), "mode": "video", "executable": "legacy" }),
    ] {
        assert!(editor_argument(payload).is_err());
    }
}
#[test]
fn typed_capture_request_rejects_invalid_modes_and_unknown_fields() {
    for patch in [
        json!({"mode":"invalid"}),
        json!({"sourceMode":"invalid"}),
        json!({"cameraId":true}),
        json!({"unknown":1}),
    ] {
        let mut value = request();
        value
            .as_object_mut()
            .unwrap()
            .extend(patch.as_object().unwrap().clone());
        assert!(recording_config(value).is_err());
    }
    let mut value = request();
    value["mode"] = json!("screenshot");
    assert!(recording_config(value).is_err());
}
#[test]
fn region_mode_requires_a_valid_normalized_rectangle() {
    let mut value = request();
    value["sourceMode"] = json!("region");
    assert!(recording_config(value.clone()).is_err());
    value["region"] = json!({"x":0.25,"y":0.25,"width":0.5,"height":0.5});
    assert!(
        recording_config(value.clone())
            .unwrap()
            .screen
            .unwrap()
            .region
            .is_some()
    );
    value["region"]["width"] = json!(2);
    assert!(recording_config(value.clone()).is_err());
    value["sourceMode"] = json!("display");
    assert!(recording_config(value).is_err());
}
#[test]
fn disabled_default_and_explicit_devices_have_distinct_domain_selections() {
    let mut value = request();
    value["cameraId"] = json!("off");
    value["microphoneId"] = json!("default");
    value["systemAudioId"] = json!("output-1");
    let config = recording_config(value).unwrap();
    assert!(matches!(config.camera, CameraSelection::Disabled));
    assert!(matches!(config.microphone, AudioSelection::Default));
    assert!(matches!(config.system_audio, AudioSelection::Device(id) if id == "output-1"));
}

#[test]
fn legacy_audio_off_sentinels_disable_both_capture_tracks() {
    for sentinel in [Value::Null, json!(""), json!("off"), json!("no-audio")] {
        let mut value = request();
        value["microphoneId"] = sentinel.clone();
        value["systemAudioId"] = sentinel.clone();
        let config = recording_config(value).expect("legacy disabled audio request");
        assert!(
            matches!(config.microphone, AudioSelection::Disabled),
            "microphone sentinel {sentinel} must disable capture"
        );
        assert!(
            matches!(config.system_audio, AudioSelection::Disabled),
            "system audio sentinel {sentinel} must disable capture"
        );
    }
}

#[test]
fn default_audio_requests_use_domain_defaults_for_both_tracks() {
    let mut value = request();
    value["microphoneId"] = json!("default");
    value["systemAudioId"] = json!("default");
    let config = recording_config(value).expect("default audio request");
    assert!(matches!(config.microphone, AudioSelection::Default));
    assert!(matches!(config.system_audio, AudioSelection::Default));
}

#[test]
fn explicit_microphone_ids_keep_their_backend_and_device_identity() {
    for id in [
        "pipewire:alsa_input.usb-Example.analog-stereo",
        "pulseaudio:alsa_input.usb-Example.analog-stereo",
        "alsa:plughw:CARD=USB,DEV=0",
    ] {
        let mut value = request();
        value["microphoneId"] = json!(id);
        let config = recording_config(value).expect("explicit microphone request");
        assert!(matches!(config.microphone, AudioSelection::Device(chosen) if chosen == id));
        assert!(matches!(config.system_audio, AudioSelection::Disabled));
    }
}
