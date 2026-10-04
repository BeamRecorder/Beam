use screencapturekit::shareable_content::SCShareableContent;

use crate::{
    CaptureError,
    model::SourceId,
    screen::{SelectionBounds, WindowSelectionPreview},
};

pub fn preview_window_selection(
    source: &SourceId,
    raise: bool,
) -> Result<WindowSelectionPreview, CaptureError> {
    let id = super::super::selection::parse_window_id(source, "sck:window:", 10)?;
    let content = SCShareableContent::create()
        .with_on_screen_windows_only(false)
        .with_exclude_desktop_windows(true)
        .get()
        .map_err(|error| {
            CaptureError::Backend(format!("Could not inspect the selected window: {error}"))
        })?;
    let window = content
        .windows()
        .into_iter()
        .find(|window| u64::from(window.window_id()) == id)
        .ok_or_else(|| CaptureError::SourceNotFound(source.to_string()))?;
    let frame = window.frame();
    let application = window
        .owning_application()
        .ok_or_else(|| CaptureError::SourceNotFound(source.to_string()))?;
    let title = window.title().unwrap_or_default();
    if !super::catalog_policy::is_user_window_candidate(
        window.window_layer(),
        &title,
        &application.application_name(),
        &application.bundle_identifier(),
        frame.size.width,
        frame.size.height,
    ) {
        return Err(CaptureError::SourceNotFound(source.to_string()));
    }
    let bounds = SelectionBounds::from_rect(
        frame.origin.x,
        frame.origin.y,
        frame.size.width,
        frame.size.height,
    )?;
    let raise_error = if raise {
        super::selection_accessibility::raise_window(application.process_id(), &bounds, &title)
            .err()
    } else {
        None
    };
    Ok(WindowSelectionPreview {
        bounds,
        raise_error,
    })
}
