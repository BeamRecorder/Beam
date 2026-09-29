use crate::fixtures::point;
use beam_editor_engine::video::zoom::{
    playback::{at, clamp, cursor_at, strength},
    types::{Camera, Zoom},
};
fn zoom() -> Zoom {
    Zoom {
        start_ms: 2000,
        end_ms: 5000,
        cx: 0.8,
        cy: 0.2,
        scale: 2.,
    }
}
#[test]
fn source_viewport_stays_inside_the_original_at_both_extremes() {
    assert_eq!(
        clamp(Camera {
            x: 0.,
            y: 1.,
            scale: 1.
        }),
        Camera::default()
    );
    assert_eq!(
        clamp(Camera {
            x: 0.,
            y: 1.,
            scale: 2.
        }),
        Camera {
            x: 0.25,
            y: 0.75,
            scale: 2.
        }
    );
}
#[test]
fn easing_ends_at_rest_and_short_zooms_have_a_finite_envelope() {
    let z = zoom();
    assert_eq!(strength(&z, 0.), 0.);
    assert_eq!(strength(&z, 9000.), 0.);
    assert_eq!(strength(&z, 3500.), 1.);
    let short = Zoom {
        start_ms: 1000,
        end_ms: 1200,
        ..z
    };
    for time in (0..4000).step_by(11) {
        assert!((0.0..=1.0).contains(&strength(&short, time as f64)));
    }
    assert_eq!(at(&[], 1000.).0, Camera::default());
}
#[test]
fn cursor_interpolation_handles_empty_duplicate_and_endpoint_samples() {
    assert_eq!(cursor_at(&[], 0.), None);
    let points = [point(100, 0.1, 0.2, None), point(200, 0.9, 0.8, None)];
    assert_eq!(cursor_at(&points, 0.).unwrap().x, 0.1);
    assert!((cursor_at(&points, 150.).unwrap().x - 0.5).abs() < 1e-9);
    assert_eq!(cursor_at(&points, 500.).unwrap().x, 0.9);
    assert_eq!(
        cursor_at(
            &[point(100, 0.1, 0.2, None), point(100, 0.9, 0.8, None)],
            100.
        )
        .unwrap()
        .x,
        0.9
    );
}
#[test]
fn connected_zooms_pan_between_real_foci_without_cursor_follow() {
    let a = zoom();
    let b = Zoom {
        start_ms: 6000,
        end_ms: 8000,
        cx: 0.3,
        cy: 0.7,
        ..zoom()
    };
    let (camera, envelope, follows) = at(&[a, b], 5500.);
    assert!(!follows);
    assert_eq!(envelope, 1.);
    assert!(camera.x < 0.75 && camera.x > 0.3);
    let (camera, _, follows) = at(&[zoom()], 3500.);
    assert!(follows);
    assert_eq!(camera.scale, 2.);
}
