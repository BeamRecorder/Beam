use super::connection::{Connection, connect, error};
use crate::{
    CaptureError,
    model::{
        MediaFormat, SourceCapabilities, SourceDescriptor, SourceId, SourceKind,
        SourceSelectionMode,
    },
    screen::{SelectionBounds, WindowSelectionPreview},
};
use x11rb::{
    connection::Connection as _,
    protocol::{
        composite::ConnectionExt as _,
        randr::ConnectionExt as _,
        xfixes::ConnectionExt as _,
        xproto::{AtomEnum, ConnectionExt as _, MapState},
    },
};

#[derive(Clone, Debug)]
pub(super) struct Target {
    pub id: String,
    pub label: String,
    pub root: u32,
    pub window: Option<u32>,
    pub bounds: SelectionBounds,
    pub visual: u32,
}
pub(crate) struct Catalog {
    pub sources: Vec<SourceDescriptor>,
    pub windows: bool,
}
pub(crate) fn catalog() -> Result<Catalog, CaptureError> {
    if !super::session_supported() {
        return Err(error("Direct capture requires an X11 session"));
    }
    let (connection, screen) = connect()?;
    connection
        .xfixes_query_version(5, 0)
        .map_err(error)?
        .reply()
        .map_err(error)?;
    let targets = targets(&connection, screen, true)?;
    let windows = composite_available(&connection);
    let sources = targets
        .into_iter()
        .enumerate()
        .map(|(index, target)| {
            Ok(SourceDescriptor {
                id: SourceId::new(target.id.clone())?,
                kind: if target.window.is_some() {
                    SourceKind::Window
                } else {
                    SourceKind::Display
                },
                label: target.label,
                is_default: index == 0,
                selection_mode: SourceSelectionMode::Direct,
                display_id: target.window.is_none().then(|| target.id.clone()),
                capabilities: SourceCapabilities {
                    supports_cursor_exclusion: true,
                    formats: vec![MediaFormat::Video {
                        width: target.bounds.width,
                        height: target.bounds.height,
                        fps: 60,
                        pixel_format: Some("bgra8".into()),
                    }],
                },
            })
        })
        .collect::<Result<Vec<_>, CaptureError>>()?;
    Ok(Catalog { sources, windows })
}
fn targets(
    connection: &Connection,
    screen: usize,
    include_windows: bool,
) -> Result<Vec<Target>, CaptureError> {
    let setup = &connection.setup().roots[screen];
    let root = setup.root;
    let monitors = connection
        .randr_get_monitors(root, true)
        .map_err(error)?
        .reply()
        .map_err(error)?;
    let mut result = Vec::new();
    for monitor in monitors.monitors {
        if monitor.width == 0 || monitor.height == 0 {
            continue;
        }
        let label = String::from_utf8_lossy(
            &connection
                .get_atom_name(monitor.name)
                .map_err(error)?
                .reply()
                .map_err(error)?
                .name,
        )
        .into_owned();
        result.push(Target {
            id: format!("x11:monitor:{root}:{}", monitor.name),
            label,
            root,
            window: None,
            bounds: SelectionBounds {
                x: i32::from(monitor.x),
                y: i32::from(monitor.y),
                width: u32::from(monitor.width),
                height: u32::from(monitor.height),
            },
            visual: setup.root_visual,
        });
    }
    if result.is_empty() {
        result.push(Target {
            id: format!("x11:monitor:{root}:0"),
            label: "X11 screen".into(),
            root,
            window: None,
            bounds: SelectionBounds {
                x: 0,
                y: 0,
                width: u32::from(setup.width_in_pixels),
                height: u32::from(setup.height_in_pixels),
            },
            visual: setup.root_visual,
        });
    }
    if !include_windows {
        return Ok(result);
    }
    let clients = property(
        connection,
        root,
        "_NET_CLIENT_LIST_STACKING",
        AtomEnum::WINDOW.into(),
    )?;
    if composite_available(connection) {
        for window in clients.value32().into_iter().flatten().take(512) {
            // Windows can disappear during enumeration; omit that one, not the remaining desktop.
            if let Ok(target) = window_target(connection, root, window) {
                result.push(target);
            }
        }
    }
    Ok(result)
}
fn composite_available(connection: &Connection) -> bool {
    connection
        .composite_query_version(0, 4)
        .ok()
        .and_then(|cookie| cookie.reply().ok())
        .is_some()
}
pub(super) fn property(
    connection: &Connection,
    window: u32,
    name: &str,
    kind: u32,
) -> Result<x11rb::protocol::xproto::GetPropertyReply, CaptureError> {
    let atom = connection
        .intern_atom(false, name.as_bytes())
        .map_err(error)?
        .reply()
        .map_err(error)?
        .atom;
    connection
        .get_property(false, window, atom, kind, 0, 4096)
        .map_err(error)?
        .reply()
        .map_err(error)
}
pub(super) fn window_target(
    connection: &Connection,
    root: u32,
    window: u32,
) -> Result<Target, CaptureError> {
    let attrs = connection
        .get_window_attributes(window)
        .map_err(error)?
        .reply()
        .map_err(error)?;
    if attrs.map_state != MapState::VIEWABLE || attrs.override_redirect {
        return Err(error("Window is not viewable"));
    }
    let geometry = connection
        .get_geometry(window)
        .map_err(error)?
        .reply()
        .map_err(error)?;
    let coords = connection
        .translate_coordinates(window, root, 0, 0)
        .map_err(error)?
        .reply()
        .map_err(error)?;
    let title = property(connection, window, "_NET_WM_NAME", AtomEnum::ANY.into())?;
    let title = if title.value.is_empty() {
        property(connection, window, "WM_NAME", AtomEnum::ANY.into())?.value
    } else {
        title.value
    };
    Ok(Target {
        id: format!("x11:window:{window}"),
        label: String::from_utf8_lossy(&title).into_owned(),
        root,
        window: Some(window),
        visual: attrs.visual,
        bounds: SelectionBounds {
            x: i32::from(coords.dst_x),
            y: i32::from(coords.dst_y),
            width: u32::from(geometry.width),
            height: u32::from(geometry.height),
        },
    })
}
pub(super) fn resolve(
    connection: &Connection,
    screen: usize,
    source: &SourceId,
) -> Result<Target, CaptureError> {
    if let Some(value) = source.as_str().strip_prefix("x11:window:") {
        let window = value
            .parse::<u32>()
            .ok()
            .filter(|id| *id != 0)
            .ok_or_else(|| CaptureError::SourceNotFound(source.to_string()))?;
        return window_target(connection, connection.setup().roots[screen].root, window);
    }
    targets(connection, screen, false)?
        .into_iter()
        .find(|target| target.id == source.as_str())
        .ok_or_else(|| CaptureError::SourceNotFound(source.to_string()))
}
pub(crate) fn source_bounds(source: &SourceId) -> Result<SelectionBounds, CaptureError> {
    let (connection, screen) = connect()?;
    Ok(resolve(&connection, screen, source)?.bounds)
}
pub(crate) fn preview_window(
    source: &SourceId,
    raise: bool,
) -> Result<WindowSelectionPreview, CaptureError> {
    let (connection, screen) = connect()?;
    let target = resolve(&connection, screen, source)?;
    let window = target
        .window
        .ok_or_else(|| error("Expected a window source"))?;
    let raise_error = if raise {
        connection
            .configure_window(
                window,
                &x11rb::protocol::xproto::ConfigureWindowAux::new()
                    .stack_mode(x11rb::protocol::xproto::StackMode::ABOVE),
            )
            .map_err(error)?
            .check()
            .err()
            .map(|error| error.to_string())
    } else {
        None
    };
    connection.flush().map_err(error)?;
    Ok(WindowSelectionPreview {
        bounds: target.bounds,
        raise_error,
    })
}
