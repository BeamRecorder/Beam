use beam_editor_domain::effects::placement_types::FramePlacement;
#[test]
fn frame_placement_retains_signed_positions_and_exact_native_dimensions() {
    let frame = FramePlacement {
        width: 640,
        height: 360,
        x: -320,
        y: 45,
    };
    assert_eq!(frame.x + frame.width / 2, 0);
    assert_eq!(frame.y + frame.height / 2, 225);
}
