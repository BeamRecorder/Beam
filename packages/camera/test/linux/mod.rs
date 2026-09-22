#![cfg(target_os = "linux")]
#![allow(clippy::expect_used)]

use beam_camera::list_cameras;

#[test]
fn discovery_returns_unique_stable_ids_even_without_hardware() {
    let first = list_cameras().expect("V4L2 discovery");
    let second = list_cameras().expect("repeat V4L2 discovery");
    assert_eq!(first, second);
    let mut ids = first
        .iter()
        .map(|device| device.id.as_str())
        .collect::<Vec<_>>();
    ids.sort_unstable();
    ids.dedup();
    assert_eq!(ids.len(), first.len());
}
