use std::cell::Cell;

use pipewire::{self as pw, spa::utils::dict::DictRef};

pub(super) struct SelectedSinkWatch {
    name: String,
    global_id: Cell<Option<u32>>,
}

impl SelectedSinkWatch {
    pub(super) fn new(name: String) -> Self {
        Self {
            name,
            global_id: Cell::new(None),
        }
    }

    pub(super) fn observe(&self, id: u32, props: &DictRef) {
        if props.get(*pw::keys::MEDIA_CLASS) == Some("Audio/Sink")
            && props.get(*pw::keys::NODE_NAME) == Some(self.name.as_str())
        {
            self.global_id.set(Some(id));
        }
    }

    pub(super) fn removed(&self, id: u32) -> bool {
        if self.global_id.get() != Some(id) {
            return false;
        }
        self.global_id.set(None);
        true
    }

    pub(super) fn name(&self) -> &str {
        &self.name
    }
}

#[path = "../../test/linux/sink_watch.rs"]
mod sink_watch_checks;
