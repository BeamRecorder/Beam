use beam_editor_domain::recording::{
    follow::target,
    types::{Camera, Follow},
};
#[test]
fn safe_zone_and_missing_cursor_keep_the_focus_stable() {
    let focus = Camera {
        scale: 2.,
        ..Camera::default()
    };
    let mut state = Follow::default();
    assert_eq!(target(&mut state, None, focus, 1., 1000.), focus);
    assert_eq!(
        target(&mut state, Some(Camera::default()), focus, 1., 1100.),
        focus
    );
}
#[test]
fn direction_lock_and_frozen_outro_do_not_oscillate() {
    let focus = Camera {
        scale: 2.,
        ..Camera::default()
    };
    let mut state = Follow::default();
    let right = Camera {
        x: 0.9,
        ..Camera::default()
    };
    let first = target(&mut state, Some(right), focus, 1., 1000.);
    assert!(first.x > 0.5);
    let left = Camera { x: 0.1, ..right };
    assert_eq!(target(&mut state, Some(left), focus, 1., 1100.), first);
    assert_eq!(target(&mut state, Some(left), focus, 0.8, 1500.), first);
}
#[test]
fn backward_seeks_and_inactive_envelopes_reset_follow_state() {
    let mut state = Follow::default();
    let focus = Camera {
        scale: 2.,
        ..Camera::default()
    };
    target(&mut state, None, focus, 1., 2000.);
    assert_eq!(target(&mut state, None, focus, 1., 1000.), focus);
    assert!(!state.initialized);
    target(&mut state, None, focus, 0.5, 1500.);
    assert!(!state.full);
    target(&mut state, None, focus, 0., 1600.);
    assert!(!state.initialized);
}
