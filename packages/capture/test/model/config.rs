use capture::model::ScreenRegion;

#[test]
fn region_validation_rejects_nonfinite_or_out_of_bounds_rectangles() {
    for region in [
        ScreenRegion {
            x: f64::NAN,
            y: 0.0,
            width: 0.5,
            height: 0.5,
        },
        ScreenRegion {
            x: 0.0,
            y: 0.0,
            width: 0.0,
            height: 0.5,
        },
        ScreenRegion {
            x: 0.75,
            y: 0.0,
            width: 0.5,
            height: 0.5,
        },
    ] {
        assert!(region.validate().is_err());
    }
    assert!(
        ScreenRegion {
            x: 0.25,
            y: 0.25,
            width: 0.5,
            height: 0.5
        }
        .validate()
        .is_ok()
    );
}
