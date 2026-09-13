use screencapturekit::shareable_content::SCShareableContent;

use crate::{
    CaptureError,
    model::{
        MediaFormat, SourceCapabilities, SourceDescriptor, SourceId, SourceKind,
        SourceSelectionMode,
    },
};

use super::catalog_policy::is_user_window_candidate;

pub fn discover_sources() -> Result<Vec<SourceDescriptor>, CaptureError> {
    let content = SCShareableContent::create()
        // Desktop-independent windows remain selectable in other Spaces and
        // while another application owns the active fullscreen Space.
        .with_on_screen_windows_only(false)
        .with_exclude_desktop_windows(true)
        .get()
        .map_err(backend_error)?;
    let mut sources = Vec::new();
    sources.extend(
        content
            .displays()
            .into_iter()
            .map(display_descriptor)
            .collect::<Result<Vec<_>, _>>()?,
    );
    sources.extend(content.windows().into_iter().filter_map(window_descriptor));
    sources.extend(
        content
            .applications()
            .into_iter()
            .map(application_descriptor)
            .collect::<Result<Vec<_>, _>>()?,
    );
    Ok(sources)
}

fn display_descriptor(
    display: screencapturekit::shareable_content::SCDisplay,
) -> Result<SourceDescriptor, CaptureError> {
    Ok(SourceDescriptor {
        id: SourceId::new(format!("sck:display:{}", display.display_id()))?,
        kind: SourceKind::Display,
        label: format!("Display {}", display.display_id()),
        is_default: display.display_id() == core_graphics::display::CGDisplay::main().id,
        selection_mode: SourceSelectionMode::Direct,
        display_id: Some(display.display_id().to_string()),
        capabilities: SourceCapabilities {
            formats: vec![MediaFormat::Video {
                width: display.width(),
                height: display.height(),
                fps: 60,
                pixel_format: Some("bgra8".into()),
            }],
            supports_cursor_exclusion: true,
        },
    })
}

fn window_descriptor(
    window: screencapturekit::shareable_content::SCWindow,
) -> Option<SourceDescriptor> {
    let title = window.title()?;
    if title.trim().is_empty() {
        return None;
    }
    let application = window.owning_application()?;
    let application_name = application.application_name();
    let frame = window.frame();
    if !is_user_window_candidate(
        window.window_layer(),
        &title,
        &application_name,
        frame.size.width,
        frame.size.height,
    ) {
        return None;
    }
    let width = dimension(frame.size.width);
    let height = dimension(frame.size.height);
    let label = format!("{title} — {application_name}");
    Some(SourceDescriptor {
        id: SourceId::new(format!("sck:window:{}", window.window_id())).ok()?,
        kind: SourceKind::Window,
        label,
        is_default: false,
        selection_mode: SourceSelectionMode::Direct,
        display_id: None,
        capabilities: SourceCapabilities {
            formats: vec![MediaFormat::Video {
                width,
                height,
                fps: 60,
                pixel_format: Some("bgra8".into()),
            }],
            supports_cursor_exclusion: true,
        },
    })
}

fn application_descriptor(
    application: screencapturekit::shareable_content::SCRunningApplication,
) -> Result<SourceDescriptor, CaptureError> {
    let bundle = application.bundle_identifier();
    Ok(SourceDescriptor {
        id: SourceId::new(format!(
            "sck:application:{}:{}",
            application.process_id(),
            bundle
        ))?,
        kind: SourceKind::Application,
        label: application.application_name(),
        is_default: false,
        selection_mode: SourceSelectionMode::Direct,
        display_id: None,
        capabilities: SourceCapabilities {
            supports_cursor_exclusion: true,
            ..SourceCapabilities::default()
        },
    })
}

#[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
fn dimension(value: f64) -> u32 {
    value.clamp(1.0, f64::from(u32::MAX)) as u32
}

fn backend_error(error: impl std::fmt::Display) -> CaptureError {
    CaptureError::Backend(format!("ScreenCaptureKit discovery failed: {error}"))
}
