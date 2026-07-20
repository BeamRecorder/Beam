#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CaptureRegion {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct CursorCoordinates {
    pub pixel_x: i32,
    pub pixel_y: i32,
    pub normalized_x: f64,
    pub normalized_y: f64,
    pub inside: bool,
}
pub fn map_coordinates(
    global_x: i32,
    global_y: i32,
    region: CaptureRegion,
) -> Result<CursorCoordinates, crate::CaptureError> {
    if region.width == 0 || region.height == 0 {
        return Err(crate::CaptureError::InvalidConfiguration(
            "capture region cannot be empty".into(),
        ));
    }
    let x = global_x.saturating_sub(region.x);
    let y = global_y.saturating_sub(region.y);
    let inside = x >= 0
        && y >= 0
        && u32::try_from(x).is_ok_and(|v| v < region.width)
        && u32::try_from(y).is_ok_and(|v| v < region.height);
    Ok(CursorCoordinates {
        pixel_x: x,
        pixel_y: y,
        normalized_x: f64::from(x) / f64::from(region.width),
        normalized_y: f64::from(y) / f64::from(region.height),
        inside,
    })
}
