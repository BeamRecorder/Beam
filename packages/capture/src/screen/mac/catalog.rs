use screencapturekit::shareable_content::SCShareableContent;

use crate::{
    CaptureError,
    model::{
        MediaFormat, SourceCapabilities, SourceDescriptor, SourceId, SourceKind,
        SourceSelectionMode,
    },
};

pub fn discover_sources() -> Result<Vec<SourceDescriptor>, CaptureError> {
    let content = SCShareableContent::create()
        .with_on_screen_windows_only(true)
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
        capabilities: SourceCapabilities {
            formats: vec![MediaFormat::Video {
                width: display.width(),
                height: display.height(),
                fps: 60,
                pixel_format: Some("bgra8".into()),
            }],
            supports_cursor_exclusion: true,
            supports_system_audio: true,
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
    let frame = window.frame();
    let width = dimension(frame.size.width);
    let height = dimension(frame.size.height);
    Some(SourceDescriptor {
        id: SourceId::new(format!("sck:window:{}", window.window_id())).ok()?,
        kind: SourceKind::Window,
        label: title,
        is_default: false,
        selection_mode: SourceSelectionMode::Direct,
        capabilities: SourceCapabilities {
            formats: vec![MediaFormat::Video {
                width,
                height,
                fps: 60,
                pixel_format: Some("bgra8".into()),
            }],
            supports_cursor_exclusion: true,
            supports_system_audio: true,
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
        capabilities: SourceCapabilities {
            supports_cursor_exclusion: true,
            supports_system_audio: true,
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
