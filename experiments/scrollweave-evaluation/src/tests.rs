use super::compare;
use scrollweave::{Image, SwResult};

#[test]
fn exact_source_pixels_report_zero_error() -> SwResult<()> {
    let image = Image::solid(2, 2, [12, 34, 56])?;
    assert_eq!(compare(&image, &image), (Some(0.0), Some(1.0)));
    Ok(())
}

#[test]
fn changed_dimensions_are_not_compared_as_matching_content() -> SwResult<()> {
    let actual = Image::solid(2, 2, [12, 34, 56])?;
    let expected = Image::solid(2, 3, [12, 34, 56])?;
    assert_eq!(compare(&actual, &expected), (None, None));
    Ok(())
}

#[test]
fn a_changed_pixel_is_reported_even_when_dimensions_match() -> SwResult<()> {
    let expected = Image::solid(2, 2, [0, 0, 0])?;
    let mut actual = expected.clone();
    actual.set(0, 0, [12, 0, 0]);
    assert_eq!(compare(&actual, &expected), (Some(1.0), Some(0.75)));
    Ok(())
}
