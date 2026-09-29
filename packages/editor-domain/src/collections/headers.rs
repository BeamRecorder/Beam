//! Lightweight clip metadata sufficient for temporal regions and render window selection.
use super::track_types::TrackHeader;
use super::{ItemHeader, PersistentItem};
use crate::{
    Clip, Track,
    effects::Instance,
    timing::{Rate, TimeRange},
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct InstanceHeader {
    pub id: Uuid,
    pub definition_id: String,
    pub definition_version: u32,
    pub enabled: bool,
    pub range: Option<TimeRange>,
    pub name: Option<String>,
}
impl From<&Instance> for InstanceHeader {
    fn from(instance: &Instance) -> Self {
        Self {
            id: instance.id,
            definition_id: instance.definition_id.clone(),
            definition_version: instance.definition_version,
            enabled: instance.enabled,
            range: instance.range,
            name: instance.name.clone(),
        }
    }
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ClipHeader {
    pub id: Uuid,
    pub asset_id: Uuid,
    pub track_id: Uuid,
    pub start_ms: u64,
    pub source_in_ms: u64,
    pub duration_ms: u64,
    pub rate: Rate,
    pub animation_offset_ms: i64,
    pub instances: Vec<InstanceHeader>,
    pub keyframe_ids: Vec<Uuid>,
    pub generator: Option<InstanceHeader>,
    pub title: Option<crate::timeline::title_types::Title>,
    pub link_group: Option<Uuid>,
}
impl ItemHeader for ClipHeader {
    fn id(&self) -> Uuid {
        self.id
    }
    fn identities(&self) -> Vec<Uuid> {
        std::iter::once(self.id)
            .chain(self.instances.iter().map(|instance| instance.id))
            .chain(self.generator.iter().map(|instance| instance.id))
            .chain(self.keyframe_ids.iter().copied())
            .collect()
    }
}
impl ItemHeader for TrackHeader {
    fn id(&self) -> Uuid {
        self.id
    }
    fn identities(&self) -> Vec<Uuid> {
        std::iter::once(self.id)
            .chain(self.instances.iter().map(|instance| instance.id))
            .chain(self.keyframe_ids.iter().copied())
            .collect()
    }
}
impl PersistentItem for Clip {
    type Header = ClipHeader;
    fn id(&self) -> Uuid {
        self.id
    }
    fn header(&self) -> ClipHeader {
        ClipHeader {
            id: self.id,
            asset_id: self.asset_id,
            track_id: self.track_id,
            start_ms: self.start_ms,
            source_in_ms: self.source_in_ms,
            duration_ms: self.duration_ms,
            rate: self.rate,
            animation_offset_ms: self.animation_offset_ms,
            instances: self.instances.iter().map(InstanceHeader::from).collect(),
            keyframe_ids: self
                .instances
                .iter()
                .chain(self.generator.iter())
                .flat_map(|instance| instance.parameters.values())
                .flat_map(|binding| match binding {
                    crate::animation::Binding::Constant { .. } => [].iter(),
                    crate::animation::Binding::Curve { keys, .. } => keys.iter(),
                })
                .map(|key| key.id)
                .collect(),
            generator: self.generator.as_ref().map(InstanceHeader::from),
            title: self.title.clone(),
            link_group: self.link_group,
        }
    }
}
impl PersistentItem for Track {
    type Header = TrackHeader;
    fn id(&self) -> Uuid {
        self.id
    }
    fn header(&self) -> TrackHeader {
        TrackHeader {
            id: self.id,
            name: self.name.clone(),
            kind: self.kind,
            muted: self.muted,
            hidden: self.hidden,
            instances: self.instances.iter().map(InstanceHeader::from).collect(),
            keyframe_ids: self
                .instances
                .iter()
                .flat_map(|instance| instance.parameters.values())
                .flat_map(|binding| match binding {
                    crate::animation::Binding::Constant { .. } => [].iter(),
                    crate::animation::Binding::Curve { keys, .. } => keys.iter(),
                })
                .map(|key| key.id)
                .collect(),
        }
    }
}
