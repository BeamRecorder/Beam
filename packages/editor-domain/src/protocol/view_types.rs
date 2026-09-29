//! Timeline snapshots carry placement metadata, while inspector payloads are queried by ID.
use crate::{
    collections::{ClipHeader, InstanceHeader},
    effects::Definition,
    timeline::title_types::Title,
    timing::Rate,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ClipOverview {
    pub id: Uuid,
    pub asset_id: Uuid,
    pub track_id: Uuid,
    pub start_ms: u64,
    pub source_in_ms: u64,
    pub duration_ms: u64,
    pub rate: Rate,
    pub animation_offset_ms: i64,
    pub link_group: Option<Uuid>,
    pub title: Option<Title>,
    pub generator: Option<InstanceHeader>,
    pub effect_count: usize,
    pub region_count: usize,
}
impl ClipOverview {
    pub fn from_header(clip: &ClipHeader, definitions: &[Definition]) -> Self {
        let region_count = clip
            .instances
            .iter()
            .chain(clip.generator.iter())
            .filter(|instance| {
                instance.range.is_some()
                    || definitions.iter().any(|definition| {
                        definition.id == instance.definition_id
                            && definition.version == instance.definition_version
                            && definition.timeline_region
                    })
            })
            .count();
        Self {
            id: clip.id,
            asset_id: clip.asset_id,
            track_id: clip.track_id,
            start_ms: clip.start_ms,
            source_in_ms: clip.source_in_ms,
            duration_ms: clip.duration_ms,
            rate: clip.rate,
            animation_offset_ms: clip.animation_offset_ms,
            link_group: clip.link_group,
            title: clip.title.clone(),
            generator: clip.generator.clone(),
            effect_count: clip.instances.len(),
            region_count,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TrackOverview {
    pub id: Uuid,
    pub name: String,
    pub kind: crate::TrackKind,
    pub muted: bool,
    pub hidden: bool,
    pub effect_count: usize,
    pub region_count: usize,
}
impl TrackOverview {
    pub fn from_header(
        track: &crate::collections::track_types::TrackHeader,
        definitions: &[Definition],
    ) -> Self {
        let region_count = track
            .instances
            .iter()
            .filter(|instance| {
                instance.range.is_some()
                    || definitions.iter().any(|definition| {
                        definition.id == instance.definition_id
                            && definition.version == instance.definition_version
                            && definition.timeline_region
                    })
            })
            .count();
        Self {
            id: track.id,
            name: track.name.clone(),
            kind: track.kind,
            muted: track.muted,
            hidden: track.hidden,
            effect_count: track.instances.len(),
            region_count,
        }
    }
}
