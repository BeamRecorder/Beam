#![cfg(target_os = "linux")]
#![allow(clippy::expect_used)]

use beam_audio::list_system_outputs;

#[test]
#[ignore = "requires a running PipeWire server with an audio sink"]
fn linux_system_output_catalog_exposes_the_selectable_default_id() {
    let outputs = list_system_outputs().expect("PipeWire output catalog");
    assert!(outputs.len() >= 2);
    assert_eq!(outputs[0].id, "pipewire:default-output");
    assert!(outputs[0].is_default);
    assert!(
        outputs[1..]
            .iter()
            .all(|output| output.id.starts_with("pipewire:sink:") && !output.is_default)
    );
}
