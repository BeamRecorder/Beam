use beam_editor_engine::video::{
    gpu::camera::sample,
    zoom::types::{Camera, CameraKey},
};

#[test]
fn sparse_camera_interpolation_is_seek_safe_at_empty_and_boundary_times() {
    assert_eq!(sample(&[], 100), Camera::default());
    let left = Camera {
        x: 0.2,
        y: 0.3,
        scale: 1.,
    };
    let right = Camera {
        x: 0.8,
        y: 0.7,
        scale: 3.,
    };
    let keys = [
        CameraKey {
            time_ms: 100,
            camera: left,
        },
        CameraKey {
            time_ms: 300,
            camera: right,
        },
    ];
    assert_eq!(sample(&keys, 0), left);
    assert_eq!(sample(&keys, 100), left);
    assert_eq!(sample(&keys, 300), right);
    assert_eq!(sample(&keys, u64::MAX), right);
    let middle = sample(&keys, 200);
    assert!((middle.x - 0.5).abs() < 1e-9);
    assert!((middle.y - 0.5).abs() < 1e-9);
    assert_eq!(middle.scale, 2.);
    assert_eq!(sample(&[keys[0], keys[0]], 100), left);
}
