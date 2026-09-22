#![cfg(test)]

use pipewire::{self as pw, properties::properties};

use super::SelectedSinkWatch;

#[test]
fn selected_sink_removal_is_reported_once() {
    let watch = SelectedSinkWatch::new("beam_test".into());
    let props = properties! {
        *pw::keys::MEDIA_CLASS => "Audio/Sink",
        *pw::keys::NODE_NAME => "beam_test",
    };
    watch.observe(7, props.as_ref());
    assert_eq!(watch.name(), "beam_test");
    assert!(!watch.removed(8));
    assert!(watch.removed(7));
    assert!(!watch.removed(7));
}

#[test]
fn unrelated_nodes_cannot_interrupt_the_selected_output() {
    let watch = SelectedSinkWatch::new("beam_test".into());
    let other_sink = properties! {
        *pw::keys::MEDIA_CLASS => "Audio/Sink",
        *pw::keys::NODE_NAME => "other",
    };
    let same_name_source = properties! {
        *pw::keys::MEDIA_CLASS => "Audio/Source",
        *pw::keys::NODE_NAME => "beam_test",
    };
    watch.observe(3, other_sink.as_ref());
    watch.observe(4, same_name_source.as_ref());
    assert!(!watch.removed(3));
    assert!(!watch.removed(4));
}

#[test]
fn replacing_a_sink_id_ignores_the_stale_removal() {
    let watch = SelectedSinkWatch::new("beam_test".into());
    let props = properties! {
        *pw::keys::MEDIA_CLASS => "Audio/Sink",
        *pw::keys::NODE_NAME => "beam_test",
    };
    watch.observe(10, props.as_ref());
    watch.observe(11, props.as_ref());
    assert!(!watch.removed(10));
    assert!(watch.removed(11));
}
