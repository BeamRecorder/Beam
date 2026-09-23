use crate::{
    CaptureError,
    model::{ScreenRegion, SourceId},
};
use screencapturekit::{
    shareable_content::SCShareableContent, stream::content_filter::SCContentFilter,
};
pub(crate) fn resolve_filter(
    content: &SCShareableContent,
    source_id: &SourceId,
    region: Option<ScreenRegion>,
    excluded_window_handles: &[String],
) -> Result<
    (
        SCContentFilter,
        u32,
        u32,
        Option<screencapturekit::cg::CGRect>,
    ),
    CaptureError,
> {
    if let Some(id) = source_id.as_str().strip_prefix("sck:display:") {
        let display_id = id
            .parse::<u32>()
            .map_err(|error| CaptureError::InvalidConfiguration(error.to_string()))?;
        let display = content
            .displays()
            .into_iter()
            .find(|display| display.display_id() == display_id)
            .ok_or_else(|| CaptureError::SourceNotFound(source_id.to_string()))?;
        let width = display.width();
        let height = display.height();
        let excluded_ids = excluded_window_handles
            .iter()
            .filter_map(|value| value.parse::<u32>().ok())
            .collect::<std::collections::HashSet<_>>();
        let excluded_windows = content
            .windows()
            .into_iter()
            .filter(|window| excluded_ids.contains(&window.window_id()))
            .collect::<Vec<_>>();
        let excluded_refs = excluded_windows.iter().collect::<Vec<_>>();
        let filter = SCContentFilter::create()
            .with_display(&display)
            .with_excluding_windows(&excluded_refs)
            .build();
        return crop_filter(
            filter,
            width,
            height,
            display.frame().size.width,
            display.frame().size.height,
            region,
        );
    }
    if let Some(id) = source_id.as_str().strip_prefix("sck:window:") {
        let window_id = id
            .parse::<u32>()
            .map_err(|error| CaptureError::InvalidConfiguration(error.to_string()))?;
        let window = content
            .windows()
            .into_iter()
            .find(|window| window.window_id() == window_id)
            .ok_or_else(|| CaptureError::SourceNotFound(source_id.to_string()))?;
        let frame = window.frame();
        return crop_filter(
            SCContentFilter::create().with_window(&window).build(),
            dimension(frame.size.width),
            dimension(frame.size.height),
            frame.size.width,
            frame.size.height,
            region,
        );
    }
    if source_id.as_str().starts_with("sck:application:") {
        let application = content
            .applications()
            .into_iter()
            .find(|application| application_id(application).is_ok_and(|id| &id == source_id))
            .ok_or_else(|| CaptureError::SourceNotFound(source_id.to_string()))?;
        let display = content
            .displays()
            .into_iter()
            .next()
            .ok_or_else(|| CaptureError::SourceNotFound("primary display".into()))?;
        let width = display.width();
        let height = display.height();
        let filter = SCContentFilter::create()
            .with_display(&display)
            .with_including_applications(&[&application], &[])
            .build();
        return crop_filter(
            filter,
            width,
            height,
            display.frame().size.width,
            display.frame().size.height,
            region,
        );
    }
    Err(CaptureError::InvalidConfiguration(format!(
        "{source_id} is not a ScreenCaptureKit source"
    )))
}

fn application_id(
    application: &screencapturekit::shareable_content::SCRunningApplication,
) -> Result<SourceId, CaptureError> {
    Ok(SourceId::new(format!(
        "sck:application:{}:{}",
        application.process_id(),
        application.bundle_identifier()
    ))?)
}

#[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
fn dimension(value: f64) -> u32 {
    let rounded = value.clamp(2.0, f64::from(u32::MAX)) as u32;
    (rounded & !1).max(2)
}

fn crop_filter(
    filter: SCContentFilter,
    width: u32,
    height: u32,
    point_width: f64,
    point_height: f64,
    region: Option<ScreenRegion>,
) -> Result<
    (
        SCContentFilter,
        u32,
        u32,
        Option<screencapturekit::cg::CGRect>,
    ),
    CaptureError,
> {
    let Some(region) = region else {
        return Ok((filter, width, height, None));
    };
    let (left, top, right, bottom) = region.pixel_rect(width, height)?;
    let sx = point_width / f64::from(width);
    let sy = point_height / f64::from(height);
    let rect = screencapturekit::cg::CGRect::new(
        sx * f64::from(left),
        sy * f64::from(top),
        sx * f64::from(right - left),
        sy * f64::from(bottom - top),
    );
    Ok((filter, right - left, bottom - top, Some(rect)))
}

#[path = "../../../test/screen/mac/filter.rs"]
mod filter_checks;
