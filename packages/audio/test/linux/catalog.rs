#![cfg(test)]
#![allow(clippy::expect_used)]

use pipewire::{self as pw, properties::properties};

use super::{
    finish_discovery, microphone_from_properties, selected_sink, selected_sink_with,
    sink_from_properties,
};
use crate::{AudioDevice, AudioError};
use std::cell::Cell;

fn sink(id: &str, name: &str) -> AudioDevice {
    AudioDevice {
        id: id.into(),
        name: name.into(),
        is_default: false,
    }
}

#[test]
fn microphone_source_keeps_its_cpal_id_and_prefers_its_description() {
    let props = properties! {
        *pw::keys::MEDIA_CLASS => "Audio/Source",
        *pw::keys::NODE_NAME => "alsa_input.usb-Example.analog-stereo",
        *pw::keys::NODE_DESCRIPTION => "USB studio microphone",
        *pw::keys::NODE_NICK => "USB mic",
    };
    let device = microphone_from_properties(props.as_ref()).expect("microphone source");
    assert_eq!(device.id, "pipewire:alsa_input.usb-Example.analog-stereo");
    assert_eq!(device.name, "USB studio microphone");
    assert!(!device.is_default);
}

#[test]
fn microphone_labels_fall_back_to_nickname_then_native_node_name() {
    let mut props = properties! {
        *pw::keys::MEDIA_CLASS => "Audio/Source",
        *pw::keys::NODE_NAME => "alsa_input.usb-Example.analog-stereo",
    };
    let device = microphone_from_properties(props.as_ref()).expect("unlabelled microphone");
    assert_eq!(device.name, "alsa_input.usb-Example.analog-stereo");
    props.insert(*pw::keys::NODE_NICK, "USB mic");
    let nicknamed = microphone_from_properties(props.as_ref()).expect("nicknamed microphone");
    assert_eq!(nicknamed.name, "USB mic");
    assert_eq!(nicknamed.id, device.id);
}

#[test]
fn hardware_duplex_is_a_microphone_only_when_it_has_a_device_identity() {
    let mut props = properties! {
        *pw::keys::MEDIA_CLASS => "Audio/Duplex",
        *pw::keys::NODE_NAME => "usb_interface.capture-playback",
        *pw::keys::NODE_DESCRIPTION => "USB audio interface",
    };
    assert!(microphone_from_properties(props.as_ref()).is_none());
    props.insert("device.id", "42");
    let device = microphone_from_properties(props.as_ref()).expect("hardware duplex");
    assert_eq!(device.id, "pipewire:usb_interface.capture-playback");
    assert_eq!(device.name, "USB audio interface");
    assert!(!device.is_default);
}

#[test]
fn output_application_stream_and_internal_nodes_are_not_microphones() {
    for class in [
        "Audio/Sink",
        "Stream/Input/Audio",
        "Stream/Output/Audio",
        "Audio/Source/Internal",
        "Audio/Sink/Internal",
        "Audio/Duplex/Internal",
        "Video/Source",
    ] {
        let props = properties! {
            *pw::keys::MEDIA_CLASS => class,
            *pw::keys::NODE_NAME => "node.with.hardware.property",
            "device.id" => "42",
        };
        assert!(
            microphone_from_properties(props.as_ref()).is_none(),
            "{class} must not enter the microphone menu"
        );
    }
}

#[test]
fn microphone_discovery_requires_both_class_and_native_node_name() {
    let missing_class = properties! { *pw::keys::NODE_NAME => "alsa_input.usb-Example" };
    assert!(microphone_from_properties(missing_class.as_ref()).is_none());
    let missing_name = properties! { *pw::keys::MEDIA_CLASS => "Audio/Source" };
    assert!(microphone_from_properties(missing_name.as_ref()).is_none());
}

#[test]
fn microphones_with_identical_labels_keep_distinct_source_identities() {
    let first = properties! {
        *pw::keys::MEDIA_CLASS => "Audio/Source",
        *pw::keys::NODE_NAME => "alsa_input.usb-first.analog-stereo",
        *pw::keys::NODE_DESCRIPTION => "USB microphone",
    };
    let second = properties! {
        *pw::keys::MEDIA_CLASS => "Audio/Source",
        *pw::keys::NODE_NAME => "alsa_input.usb-second.analog-stereo",
        *pw::keys::NODE_DESCRIPTION => "USB microphone",
    };
    let first = microphone_from_properties(first.as_ref()).expect("first microphone");
    let second = microphone_from_properties(second.as_ref()).expect("second microphone");
    assert_eq!(first.name, second.name);
    assert_eq!(first.id, "pipewire:alsa_input.usb-first.analog-stereo");
    assert_eq!(second.id, "pipewire:alsa_input.usb-second.analog-stereo");
    assert_ne!(first.id, second.id);
}

#[test]
fn registry_sink_properties_keep_the_stable_node_name_as_selection_id() {
    let props = properties! {
        *pw::keys::MEDIA_CLASS => "Audio/Sink",
        *pw::keys::NODE_NAME => "alsa_output.usb-example",
        *pw::keys::NODE_DESCRIPTION => "USB Speakers",
    };
    let device = sink_from_properties(props.as_ref()).expect("audio sink");
    assert_eq!(device.id, "pipewire:sink:alsa_output.usb-example");
    assert_eq!(device.name, "USB Speakers");
    assert!(!device.is_default);

    let source = properties! {
        *pw::keys::MEDIA_CLASS => "Audio/Source",
        *pw::keys::NODE_NAME => "alsa_input.usb-example",
    };
    assert!(sink_from_properties(source.as_ref()).is_none());

    let unnamed = properties! { *pw::keys::MEDIA_CLASS => "Audio/Sink" };
    assert!(sink_from_properties(unnamed.as_ref()).is_none());

    let nicknamed = properties! {
        *pw::keys::MEDIA_CLASS => "Audio/Sink",
        *pw::keys::NODE_NAME => "alsa_output.second",
        *pw::keys::NODE_NICK => "Second Speaker",
    };
    assert_eq!(
        sink_from_properties(nicknamed.as_ref())
            .expect("nicknamed sink")
            .name,
        "Second Speaker"
    );
}

#[test]
fn default_and_invalid_sink_ids_are_resolved_without_a_pipewire_roundtrip() {
    assert_eq!(selected_sink(None).expect("default"), None);
    assert_eq!(
        selected_sink(Some("pipewire:default-output")).expect("default ID"),
        None
    );
    assert!(selected_sink(Some("pipewire:sink:")).is_err());
    assert!(selected_sink(Some("not-a-pipewire-sink")).is_err());
}

#[test]
fn sink_without_optional_labels_uses_its_stable_node_name() {
    let props = properties! {
        *pw::keys::MEDIA_CLASS => "Audio/Sink",
        *pw::keys::NODE_NAME => "alsa_output.headphones",
    };
    let device = sink_from_properties(props.as_ref()).expect("headphones sink");
    assert_eq!(device.id, "pipewire:sink:alsa_output.headphones");
    assert_eq!(device.name, "alsa_output.headphones");
    assert!(!device.is_default);
}

#[test]
fn sink_with_unknown_media_class_is_ignored() {
    let missing_class = properties! {
        *pw::keys::NODE_NAME => "alsa_output.headphones",
    };
    assert!(sink_from_properties(missing_class.as_ref()).is_none());
    let video = properties! {
        *pw::keys::MEDIA_CLASS => "Video/Source",
        *pw::keys::NODE_NAME => "alsa_output.headphones",
    };
    assert!(sink_from_properties(video.as_ref()).is_none());
}

#[test]
fn sink_description_takes_priority_over_nickname() {
    let props = properties! {
        *pw::keys::MEDIA_CLASS => "Audio/Sink",
        *pw::keys::NODE_NAME => "alsa_output.usb",
        *pw::keys::NODE_NICK => "Short name",
        *pw::keys::NODE_DESCRIPTION => "Full USB speaker name",
    };
    let device = sink_from_properties(props.as_ref()).expect("sink");
    assert_eq!(device.id, "pipewire:sink:alsa_output.usb");
    assert_eq!(device.name, "Full USB speaker name");
}

#[test]
fn malformed_sink_identifiers_are_rejected_before_registry_access() {
    for invalid in ["", "pipewire:", "pipewire:default", "pipewire:sink:"] {
        assert!(matches!(
            selected_sink(Some(invalid)),
            Err(crate::AudioError::DeviceUnavailable(id)) if id == invalid
        ));
    }
}

#[test]
fn incomplete_discovery_reports_timeout_even_with_partial_sinks() {
    assert!(matches!(
        finish_discovery(false, vec![sink("pipewire:sink:partial", "Partial")]),
        Err(AudioError::Backend(reason)) if reason == "PipeWire output discovery timed out"
    ));
}

#[test]
fn completed_empty_discovery_still_exposes_explicit_default_output() {
    let devices = finish_discovery(true, vec![]).expect("completed discovery");
    assert_eq!(devices.len(), 1);
    assert_eq!(devices[0].id, "pipewire:default-output");
    assert_eq!(devices[0].name, "Default system output");
    assert!(devices[0].is_default);
}

#[test]
fn discovery_sorts_and_deduplicates_sinks_before_default() {
    let devices = finish_discovery(
        true,
        vec![
            sink("pipewire:sink:z", "Z"),
            sink("pipewire:sink:a", "A"),
            sink("pipewire:sink:z", "Duplicate Z"),
        ],
    )
    .expect("completed discovery");
    assert_eq!(devices.len(), 3);
    assert_eq!(devices[0].id, "pipewire:default-output");
    assert!(devices[0].is_default);
    assert_eq!(devices[1].id, "pipewire:sink:a");
    assert_eq!(devices[2].id, "pipewire:sink:z");
    assert!(devices[1..].iter().all(|device| !device.is_default));
}

#[test]
fn explicit_sink_resolves_stable_name_from_discovery() {
    let selected = selected_sink_with(Some("pipewire:sink:alsa_output.usb"), || {
        Ok(vec![sink("pipewire:sink:alsa_output.usb", "USB Speakers")])
    })
    .expect("selected output");
    assert_eq!(selected.as_deref(), Some("alsa_output.usb"));
}

#[test]
fn absent_explicit_sink_is_rejected_after_discovery() {
    assert!(matches!(
        selected_sink_with(Some("pipewire:sink:removed"), || {
            Ok(vec![sink("pipewire:sink:other", "Other")])
        }),
        Err(AudioError::DeviceUnavailable(id)) if id == "pipewire:sink:removed"
    ));
}

#[test]
fn explicit_sink_propagates_discovery_failure() {
    assert!(matches!(
        selected_sink_with(Some("pipewire:sink:alsa_output.usb"), || {
            Err(AudioError::Backend("registry unavailable".into()))
        }),
        Err(AudioError::Backend(reason)) if reason == "registry unavailable"
    ));
}

#[test]
fn default_and_malformed_sink_ids_skip_discovery() {
    for id in [None, Some("pipewire:default-output"), Some("wrong-id")] {
        let calls = Cell::new(0);
        let result = selected_sink_with(id, || {
            calls.set(calls.get() + 1);
            Ok(Vec::new())
        });
        assert_eq!(calls.get(), 0);
        if id == Some("wrong-id") {
            assert!(matches!(result, Err(AudioError::DeviceUnavailable(_))));
        } else {
            assert_eq!(result.expect("default output"), None);
        }
    }
}
