use beam_editor_engine::video::zoom::{
    control::compile,
    types::{Camera, Zoom},
};
#[test]
fn ordinary_imports_have_two_resting_control_keys() {
    let asset = crate::fixtures::asset(10_000);
    let keys = compile(&asset).unwrap();
    assert_eq!(keys.len(), 2);
    assert_eq!(keys[0].camera, Camera::default());
    assert_eq!(keys[1].time_ms, 10_000);
}
#[test]
fn compiled_motion_is_seek_independent_sorted_and_bounded() {
    let mut asset = crate::fixtures::asset(10_000);
    std::sync::Arc::make_mut(&mut asset.zooms).push(Zoom {
        start_ms: 1000,
        end_ms: 3500,
        cx: 0.8,
        cy: 0.5,
        scale: 2.,
    });
    std::sync::Arc::make_mut(&mut asset.cursor).push(crate::fixtures::point(1000, 0.8, 0.5, None));
    let keys = compile(&asset).unwrap();
    let second = compile(&asset).unwrap();
    assert!(keys.len() < 300);
    assert!(keys.windows(2).all(|k| k[0].time_ms < k[1].time_ms));
    assert!(keys.iter().any(|k| k.camera.scale > 1.8));
    assert_eq!(keys.last().unwrap().camera, Camera::default());
    assert!(keys.iter().zip(second).all(|(a, b)| a.camera == b.camera));
}
#[test]
fn excessive_control_points_fail_instead_of_allocating_unbounded_curves() {
    let mut asset = crate::fixtures::asset(10_000_000);
    std::sync::Arc::make_mut(&mut asset.zooms).push(Zoom {
        start_ms: 0,
        end_ms: 10_000_000,
        cx: 0.5,
        cy: 0.5,
        scale: 2.,
    });
    assert!(compile(&asset).is_err());
}
