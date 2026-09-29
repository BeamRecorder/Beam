use beam_editor_engine::video::zoom::{
    spring::step,
    types::{Camera, Velocity},
};
#[test]
fn resting_camera_remains_stationary() {
    let mut velocity = Velocity::default();
    assert_eq!(
        step(
            Camera::default(),
            Camera::default(),
            &mut velocity,
            33.,
            11.95
        ),
        Camera::default()
    );
    assert_eq!(velocity.scale, 0.);
}
#[test]
fn spring_converges_without_overshoot() {
    let desired = Camera {
        x: 0.7,
        y: 0.3,
        scale: 2.,
    };
    let mut camera = Camera::default();
    let mut velocity = Velocity::default();
    for _ in 0..300 {
        camera = step(camera, desired, &mut velocity, 33., 11.95);
        assert!((1.0..=2.0).contains(&camera.scale));
    }
    assert!((camera.x - desired.x).abs() < 1e-9);
    assert!((camera.scale - 2.).abs() < 1e-9);
}
#[test]
fn large_clock_gaps_and_zero_delta_use_bounded_integrations() {
    let desired = Camera {
        scale: 2.,
        ..Camera::default()
    };
    assert_eq!(
        step(
            Camera::default(),
            desired,
            &mut Velocity::default(),
            99999.,
            11.95
        ),
        step(
            Camera::default(),
            desired,
            &mut Velocity::default(),
            80.,
            11.95
        )
    );
    assert_eq!(
        step(
            Camera::default(),
            desired,
            &mut Velocity::default(),
            0.,
            11.95
        ),
        step(
            Camera::default(),
            desired,
            &mut Velocity::default(),
            1.,
            11.95
        )
    );
}
