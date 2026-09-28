use std::{
    cell::{Cell, RefCell},
    rc::Rc,
    time::Duration,
};

use pipewire::{self as pw, spa::utils::dict::DictRef};

use crate::{AudioDevice, AudioError};

pub(super) const DEFAULT_OUTPUT: &str = "pipewire:default-output";
const SINK_PREFIX: &str = "pipewire:sink:";

pub fn list_system_outputs() -> Result<Vec<AudioDevice>, AudioError> {
    finish_discovery(true, list_nodes(sink_from_properties)?)
}

pub(super) fn list_microphones() -> Result<Vec<AudioDevice>, AudioError> {
    list_nodes(microphone_from_properties)
}

fn list_nodes(parse: fn(&DictRef) -> Option<AudioDevice>) -> Result<Vec<AudioDevice>, AudioError> {
    pw::init();
    let mainloop = pw::main_loop::MainLoopRc::new(None)
        .map_err(|error| AudioError::Backend(error.to_string()))?;
    let context = pw::context::ContextRc::new(&mainloop, None)
        .map_err(|error| AudioError::Backend(error.to_string()))?;
    let core = context
        .connect_rc(None)
        .map_err(|error| AudioError::Backend(error.to_string()))?;
    let registry = core
        .get_registry_rc()
        .map_err(|error| AudioError::Backend(error.to_string()))?;
    let sinks = Rc::new(RefCell::new(Vec::new()));
    let found = sinks.clone();
    let registry_listener = registry
        .add_listener_local()
        .global(move |global| {
            if global.type_ == pw::types::ObjectType::Node
                && let Some(props) = global.props
                && let Some(device) = parse(props)
            {
                found.borrow_mut().push(device);
            }
        })
        .register();
    let done = Rc::new(Cell::new(false));
    let finished = done.clone();
    let done_loop = mainloop.clone();
    let pending = core
        .sync(0)
        .map_err(|error| AudioError::Backend(error.to_string()))?;
    let core_listener = core
        .add_listener_local()
        .done(move |id, sequence| {
            if id == pw::core::PW_ID_CORE && sequence == pending {
                finished.set(true);
                done_loop.quit();
            }
        })
        .register();
    let timeout_loop = mainloop.clone();
    let timer = mainloop.loop_().add_timer(move |_| timeout_loop.quit());
    timer.update_timer(Some(Duration::from_secs(2)), None);
    mainloop.run();
    drop(core_listener);
    drop(registry_listener);
    if !done.get() {
        return Err(AudioError::Backend(
            "PipeWire device discovery timed out".into(),
        ));
    }
    let mut devices = sinks.borrow().clone();
    devices.sort_by(|left, right| left.id.cmp(&right.id));
    devices.dedup_by(|left, right| left.id == right.id);
    Ok(devices)
}

fn finish_discovery(
    done: bool,
    mut devices: Vec<AudioDevice>,
) -> Result<Vec<AudioDevice>, AudioError> {
    if !done {
        return Err(AudioError::Backend(
            "PipeWire output discovery timed out".into(),
        ));
    }
    devices.sort_by(|left, right| left.id.cmp(&right.id));
    devices.dedup_by(|left, right| left.id == right.id);
    devices.insert(
        0,
        AudioDevice {
            id: DEFAULT_OUTPUT.into(),
            name: "Default system output".into(),
            is_default: true,
        },
    );
    Ok(devices)
}

pub(super) fn selected_sink(device_id: Option<&str>) -> Result<Option<String>, AudioError> {
    selected_sink_with(device_id, list_system_outputs)
}

fn selected_sink_with(
    device_id: Option<&str>,
    discover: impl FnOnce() -> Result<Vec<AudioDevice>, AudioError>,
) -> Result<Option<String>, AudioError> {
    match device_id {
        None | Some(DEFAULT_OUTPUT) => Ok(None),
        Some(id) => {
            let name = id
                .strip_prefix(SINK_PREFIX)
                .filter(|name| !name.is_empty())
                .ok_or_else(|| AudioError::DeviceUnavailable(id.into()))?;
            let available = discover()?.into_iter().any(|device| device.id == id);
            if !available {
                return Err(AudioError::DeviceUnavailable(id.into()));
            }
            Ok(Some(name.into()))
        }
    }
}

fn sink_from_properties(props: &DictRef) -> Option<AudioDevice> {
    if props.get(*pw::keys::MEDIA_CLASS) != Some("Audio/Sink") {
        return None;
    }
    let name = props.get(*pw::keys::NODE_NAME)?;
    let title = props
        .get(*pw::keys::NODE_DESCRIPTION)
        .or_else(|| props.get(*pw::keys::NODE_NICK))
        .unwrap_or(name);
    Some(AudioDevice {
        id: format!("{SINK_PREFIX}{name}"),
        name: title.into(),
        is_default: false,
    })
}

#[path = "../../test/linux/catalog.rs"]
mod catalog_checks;

/// CPAL IDs identify the real source node, excluding sinks and app streams.
fn microphone_from_properties(props: &DictRef) -> Option<AudioDevice> {
    match props.get(*pw::keys::MEDIA_CLASS)? {
        "Audio/Source" => {}
        "Audio/Duplex" if props.get("device.id").is_some() => {}
        _ => return None,
    }
    let name = props.get(*pw::keys::NODE_NAME)?;
    let title = props
        .get(*pw::keys::NODE_DESCRIPTION)
        .or_else(|| props.get(*pw::keys::NODE_NICK))
        .unwrap_or(name);
    Some(AudioDevice {
        id: format!("pipewire:{name}"),
        name: title.into(),
        is_default: false,
    })
}
