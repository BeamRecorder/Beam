#[test]
fn region_rejects_empty_source_dimensions_without_panicking() {
    let region = beam_screen::model::ScreenRegion {
        x: 0.0,
        y: 0.0,
        width: 1.0,
        height: 1.0,
    };
    assert!(region.pixel_rect(0, 1).is_err());
    assert!(region.pixel_rect(1, 0).is_err());
    assert_eq!(region.pixel_rect(1, 1).unwrap(), (0, 0, 1, 1));
}
