//! Real desktop sources and foreground preview policy.

use super::{DesktopBounds, Selection, atom, backend_error, connect, root};
use crate::{
    CaptureError,
    model::{SourceCapabilities, SourceDescriptor, SourceId, SourceKind, SourceSelectionMode},
};
use x11rb::{
    connection::Connection,
    errors::ReplyError,
    protocol::{
        ErrorKind,
        randr::ConnectionExt as _,
        xproto::{
            AtomEnum, ClientMessageEvent, ConfigureWindowAux, ConnectionExt as _, EventMask,
            MapState, StackMode,
        },
    },
    rust_connection::RustConnection,
};

/// Lists physical monitors and managed application windows without a permission picker.
pub fn discover_sources() -> Result<Vec<SourceDescriptor>, CaptureError> {
    let (connection, screen) = connect()?;
    let root = root(&connection, screen);
    let monitors = connection
        .randr_get_monitors(root, true)
        .map_err(backend_error)?
        .reply()
        .map_err(backend_error)?;
    let mut sources = Vec::new();
    for monitor in monitors.monitors {
        let label = connection
            .get_atom_name(monitor.name)
            .map_err(backend_error)?
            .reply()
            .map_err(backend_error)?;
        sources.push(descriptor(
            format!("x11:monitor:{root}:{}", monitor.name),
            String::from_utf8_lossy(&label.name).into_owned(),
            SourceKind::Display,
            monitor.primary,
        )?);
    }
    if sources.is_empty() {
        sources.push(descriptor(
            format!("x11:monitor:{root}:0"),
            format!("Display {}", screen + 1),
            SourceKind::Display,
            true,
        )?);
    }
    let basic = window_types(&connection)?;
    let (windows, managed) = client_windows(&connection, root)?;
    for id in windows {
        let title = match user_window_title(&connection, id, managed, &basic) {
            Ok(title) => title,
            Err(error) => {
                // A client can disappear between any two property reads.
                let attributes = connection
                    .get_window_attributes(id)
                    .map_err(backend_error)?
                    .reply();
                if matches!(attributes, Err(ReplyError::X11Error(ref error)) if error.error_kind == ErrorKind::Window)
                {
                    continue;
                }
                return Err(error);
            }
        };
        let Some(title) = title else {
            continue;
        };
        sources.push(descriptor(
            format!("x11:window:{id}"),
            title,
            SourceKind::Window,
            false,
        )?);
    }
    Ok(sources)
}

fn descriptor(
    id: String,
    label: String,
    kind: SourceKind,
    is_default: bool,
) -> Result<SourceDescriptor, CaptureError> {
    Ok(SourceDescriptor {
        id: SourceId::new(id)?,
        label,
        kind,
        is_default,
        display_id: None,
        selection_mode: SourceSelectionMode::Direct,
        capabilities: SourceCapabilities {
            formats: Vec::new(),
            supports_cursor_exclusion: true,
        },
    })
}

fn property(
    connection: &RustConnection,
    id: u32,
    name: &[u8],
    kind: AtomEnum,
) -> Result<x11rb::protocol::xproto::GetPropertyReply, CaptureError> {
    connection
        .get_property(false, id, atom(connection, name)?, kind, 0, 1024)
        .map_err(backend_error)?
        .reply()
        .map_err(backend_error)
}

fn user_window_title(
    connection: &RustConnection,
    id: u32,
    managed: bool,
    basic: &[u32],
) -> Result<Option<String>, CaptureError> {
    let attributes = match connection
        .get_window_attributes(id)
        .map_err(backend_error)?
        .reply()
    {
        Ok(attributes) => attributes,
        Err(ReplyError::X11Error(error)) if error.error_kind == ErrorKind::Window => {
            return Ok(None);
        }
        Err(error) => return Err(backend_error(error)),
    };
    if attributes.override_redirect || (!managed && attributes.map_state != MapState::VIEWABLE) {
        return Ok(None);
    }
    let pid = property(connection, id, b"_NET_WM_PID", AtomEnum::CARDINAL)?
        .value32()
        .and_then(|mut values| values.next());
    if pid == Some(std::process::id()) {
        return Ok(None);
    }
    let types = property(connection, id, b"_NET_WM_WINDOW_TYPE", AtomEnum::ATOM)?;
    let kinds = types
        .value32()
        .map(|values| values.collect::<Vec<_>>())
        .unwrap_or_default();
    if !application_type(&kinds, basic[0], basic[1], basic) {
        return Ok(None);
    }
    let modern = property(connection, id, b"_NET_WM_NAME", AtomEnum::ANY)?;
    let legacy = if modern.value.is_empty() {
        property(connection, id, b"WM_NAME", AtomEnum::STRING)?.value
    } else {
        modern.value
    };
    let title = String::from_utf8_lossy(&legacy)
        .trim_matches('\0')
        .trim()
        .chars()
        .take(256)
        .collect::<String>();
    if title.is_empty() {
        return Ok(None);
    }
    Ok(Some(title))
}

/// Resolves known EWMH types once per catalog; normal and dialog lead the list.
fn window_types(connection: &RustConnection) -> Result<Vec<u32>, CaptureError> {
    ["NORMAL", "DIALOG", "DESKTOP", "DOCK", "TOOLBAR", "MENU", "UTILITY", "SPLASH",
        "DROPDOWN_MENU", "POPUP_MENU", "TOOLTIP", "NOTIFICATION", "COMBO", "DND"]
        .into_iter().map(|name| atom(connection, format!("_NET_WM_WINDOW_TYPE_{name}").as_bytes()))
        .collect()
}

fn application_type(kinds: &[u32], normal: u32, dialog: u32, basic: &[u32]) -> bool {
    kinds
        .iter()
        .find(|kind| basic.contains(kind))
        .is_none_or(|kind| *kind == normal || *kind == dialog)
}

fn client_windows(
    connection: &RustConnection,
    root: u32,
) -> Result<(Vec<u32>, bool), CaptureError> {
    for name in [
        b"_NET_CLIENT_LIST_STACKING".as_slice(),
        b"_NET_CLIENT_LIST".as_slice(),
    ] {
        let clients = property(connection, root, name, AtomEnum::WINDOW)?;
        let ids = clients
            .value32()
            .map(|values| values.collect::<Vec<_>>())
            .unwrap_or_default();
        if !ids.is_empty() {
            return Ok((ids, true));
        }
    }
    Ok((
        connection
            .query_tree(root)
            .map_err(backend_error)?
            .reply()
            .map_err(backend_error)?
            .children,
        false,
    ))
}

fn stack(connection: &RustConnection, root: u32) -> Result<Vec<u32>, CaptureError> {
    client_windows(connection, root).map(|(ids, _)| ids)
}

/// Returns the current client stack in bottom-to-top order for cancel restoration.
pub fn window_stack() -> Result<Vec<String>, CaptureError> {
    let (connection, screen) = connect()?;
    Ok(stack(&connection, root(&connection, screen))?
        .into_iter()
        .map(|id| format!("x11:window:{id}"))
        .collect())
}

/// Returns the selected drawable's live rectangle in physical desktop coordinates.
pub fn window_bounds(id: &SourceId) -> Result<DesktopBounds, CaptureError> {
    let (connection, _) = connect()?;
    bounds(&connection, Selection::parse(id.as_str())?)
}

pub(crate) fn bounds(
    connection: &RustConnection,
    selection: Selection,
) -> Result<DesktopBounds, CaptureError> {
    match selection {
        Selection::Window(id) => {
            let geometry = connection
                .get_geometry(id)
                .map_err(backend_error)?
                .reply()
                .map_err(backend_error)?;
            let position = connection
                .translate_coordinates(id, geometry.root, 0, 0)
                .map_err(backend_error)?
                .reply()
                .map_err(backend_error)?;
            Ok(DesktopBounds {
                x: i32::from(position.dst_x),
                y: i32::from(position.dst_y),
                width: u32::from(geometry.width),
                height: u32::from(geometry.height),
            })
        }
        Selection::Monitor { root, name: 0 } => {
            let geometry = connection
                .get_geometry(root)
                .map_err(backend_error)?
                .reply()
                .map_err(backend_error)?;
            Ok(DesktopBounds {
                x: 0,
                y: 0,
                width: u32::from(geometry.width),
                height: u32::from(geometry.height),
            })
        }
        Selection::Monitor { root, name } => {
            let monitors = connection
                .randr_get_monitors(root, true)
                .map_err(backend_error)?
                .reply()
                .map_err(backend_error)?;
            let monitor = monitors
                .monitors
                .into_iter()
                .find(|monitor| monitor.name == name)
                .ok_or_else(|| CaptureError::SourceNotFound(format!("X11 monitor {name}")))?;
            Ok(DesktopBounds {
                x: i32::from(monitor.x),
                y: i32::from(monitor.y),
                width: u32::from(monitor.width),
                height: u32::from(monitor.height),
            })
        }
    }
}

/// Raises one real client without changing keyboard focus or its saved geometry.
pub fn raise_window(id: &SourceId) -> Result<(), CaptureError> {
    let Selection::Window(window) = Selection::parse(id.as_str())? else {
        return Err(CaptureError::InvalidConfiguration(
            "expected an X11 window".into(),
        ));
    };
    let (connection, _) = connect()?;
    connection
        .configure_window(
            window,
            &ConfigureWindowAux::new().stack_mode(StackMode::ABOVE),
        )
        .map_err(backend_error)?
        .check()
        .map_err(backend_error)?;
    connection.flush().map_err(backend_error)
}

/// Asks the window manager to activate a chosen recording target.
pub fn activate_window(id: &SourceId) -> Result<(), CaptureError> {
    let Selection::Window(window) = Selection::parse(id.as_str())? else {
        return Err(CaptureError::InvalidConfiguration(
            "expected an X11 window".into(),
        ));
    };
    let (connection, screen) = connect()?;
    let event = ClientMessageEvent::new(
        32,
        window,
        atom(&connection, b"_NET_ACTIVE_WINDOW")?,
        [2, x11rb::CURRENT_TIME, 0, 0, 0],
    );
    connection
        .send_event(
            false,
            root(&connection, screen),
            EventMask::SUBSTRUCTURE_REDIRECT | EventMask::SUBSTRUCTURE_NOTIFY,
            event,
        )
        .map_err(backend_error)?
        .check()
        .map_err(backend_error)?;
    connection.flush().map_err(backend_error)
}

#[path = "../../../../test/screen/linux/x11/catalog.rs"]
mod checks;
