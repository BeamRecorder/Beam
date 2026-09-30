use beam_editor_domain::recording::cursor_motion_types::MotionKey;
#[test]
fn zero_checkpoint_is_stationary_and_copyable() {
    let key = MotionKey::default();
    let copy = key;
    assert_eq!([copy.x, copy.y, copy.vx, copy.vy], [0.; 4]);
}
