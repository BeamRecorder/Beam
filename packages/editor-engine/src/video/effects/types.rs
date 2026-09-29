//! Render-owned immutable decisions; no source pixels or telemetry are copied here.
use crate::{Canvas, Clip, MediaAsset};
use beam_editor_domain::recording::{
    style_types::{CursorIndex, RecordingStyle},
    types::CameraKey,
};
use std::{
    collections::HashMap,
    sync::{Arc, RwLock},
};
use uuid::Uuid;

pub(crate) type ClipStates = HashMap<Uuid, ClipState>;
pub(crate) type RenderState = Arc<RwLock<RenderDecisions>>;

pub(crate) struct RenderDecisions {
    pub clips: ClipStates,
    pub transitions: HashMap<Uuid, TransitionState>,
    pub scopes: HashMap<Uuid, ScopeState>,
}
pub(crate) struct ScopeState {
    pub instances: Vec<beam_editor_domain::effects::Instance>,
    pub muted: bool,
}
impl std::ops::Deref for RenderDecisions {
    type Target = ClipStates;
    fn deref(&self) -> &Self::Target {
        &self.clips
    }
}
pub(crate) struct TransitionState {
    pub transition: beam_editor_domain::effects::Transition,
    /// The local clock begins at the actual overlap, rather than either media input.
    pub scope: beam_editor_domain::effects::transition_types::TransitionClock,
}

#[derive(Clone)]
pub(crate) struct ClipState {
    pub clip: Arc<Clip>,
    pub hidden: bool,
    pub muted: bool,
    pub asset: Option<MediaAsset>,
    pub canvas: Canvas,
    pub recording_style: RecordingStyle,
    pub camera_curves: HashMap<Uuid, Arc<Vec<CameraKey>>>,
    pub cursor_index: Option<Arc<CursorIndex>>,
}

pub(crate) struct PropertyUpdate {
    pub element: ges::TrackElement,
    pub property: gst::glib::ParamSpec,
    pub value: gst::glib::Value,
}

/// A validated parameter publication. Preparing it leaves the running graph untouched.
pub struct ParameterUpdate {
    pub(crate) state: RenderState,
    pub(crate) decisions: RenderDecisions,
    pub(crate) properties: Vec<PropertyUpdate>,
}
