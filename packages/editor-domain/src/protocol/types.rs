//! Versioned public service vocabulary. Hosts resolve opaque grants, never document paths.
use super::job_types::*;
pub use super::query_types::Query;
use crate::{
    Canvas, Clip, Track,
    animation::Value,
    commands::types::{Page, Receipt, Transaction},
    effects::{Definition, Transition},
    recording::style_types::RecordingStyle,
    recording::types::Zoom,
    timing::Time,
};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use uuid::Uuid;

pub const API_VERSION: u32 = 1;
pub const MESSAGE_BUDGET: usize = 8 * 1024 * 1024;

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "method",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum Request {
    GarbageCollect {
        #[serde(rename = "projectId")]
        project_id: Uuid,
        #[serde(rename = "expectedRevision")]
        expected_revision: u64,
    },
    SealPack {
        pack: crate::effects::pack_types::PackDraft,
    },
    Discovery,
    Schema,
    Create {
        #[serde(rename = "projectGrant")]
        project_grant: String,
        name: String,
    },
    Open {
        #[serde(rename = "projectGrant")]
        project_grant: String,
    },
    Import {
        context: RenderContext,
        #[serde(rename = "sourceGrants")]
        source_grants: Vec<String>,
    },
    ImportStart {
        context: RenderContext,
        #[serde(rename = "sourceGrants")]
        source_grants: Vec<String>,
    },
    Relink {
        context: RenderContext,
        #[serde(rename = "assetId")]
        asset_id: Uuid,
        #[serde(rename = "sourceGrant")]
        source_grant: String,
        #[serde(rename = "clipIds")]
        clip_ids: Vec<Uuid>,
    },
    Query {
        query: Query,
    },
    Transaction {
        transaction: Transaction,
    },
    ValidateTransaction {
        transaction: Transaction,
    },
    Events {
        #[serde(rename = "afterRevision")]
        after_revision: u64,
        limit: usize,
    },
    Seek {
        #[serde(rename = "positionMs")]
        position_ms: u64,
    },
    Play {
        playing: bool,
    },
    Transport,
    Export {
        context: RenderContext,
        #[serde(rename = "destinationGrant")]
        destination_grant: String,
        #[serde(rename = "fileName")]
        file_name: String,
        container: Container,
    },
    PreviewRender {
        context: RenderContext,
        time: Time,
        quality: RenderQuality,
    },
    AnalysisStart {
        context: super::SourceContext,
        algorithm: super::AnalysisAlgorithm,
    },
    ProxyStart {
        context: super::SourceContext,
        settings: super::ProxySettings,
    },
    JobGet {
        id: Uuid,
    },
    JobCancel {
        id: Uuid,
    },
    ArtifactRead {
        id: Uuid,
        offset: u64,
        length: usize,
    },
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum Response {
    ClipHeaders {
        page: Page<super::ClipOverview>,
    },
    ScopedParameterValues {
        revision: u64,
        target: super::ReadTarget,
        time: Time,
        values: BTreeMap<Uuid, BTreeMap<String, Value>>,
    },
    GarbageCollection {
        result: crate::project::gc_types::GarbageCollection,
    },
    Pack {
        pack: crate::effects::ExtensionPack,
    },
    Presets {
        page: Page<crate::effects::preset_types::Preset>,
    },
    Clip {
        revision: u64,
        clip: std::sync::Arc<Clip>,
    },
    Discovery {
        capabilities: Capabilities,
    },
    Schema {
        schema: serde_json::Value,
    },
    Project {
        project: ProjectInfo,
    },
    Imported {
        project: ProjectInfo,
        publication: crate::commands::import_types::ImportPublication,
    },
    Grants {
        page: Page<GrantInfo>,
    },
    Sequences {
        page: Page<SequenceInfo>,
    },
    Assets {
        page: Page<AssetInfo>,
    },
    Asset {
        revision: u64,
        asset: AssetInfo,
    },
    Tracks {
        page: Page<super::TrackOverview>,
    },
    Track {
        revision: u64,
        track: std::sync::Arc<Track>,
    },
    Sequence {
        revision: u64,
        sequence: SequenceInfo,
        instances: Vec<crate::effects::Instance>,
    },
    Clips {
        #[schemars(with = "Page<Clip>")]
        page: Page<std::sync::Arc<Clip>>,
    },
    Transitions {
        page: Page<Transition>,
    },
    Definitions {
        page: Page<Definition>,
    },
    Regions {
        page: Page<TimelineRegion>,
    },
    ParameterValues {
        values: BTreeMap<Uuid, BTreeMap<String, Value>>,
    },
    RecordingSuggestions {
        page: Page<Zoom>,
    },
    Receipt {
        receipt: Receipt,
    },
    Events {
        page: Page<Event>,
    },
    Transport {
        transport: TransportInfo,
    },
    Job {
        job: JobInfo,
    },
    Jobs {
        page: Page<JobInfo>,
    },
    Artifacts {
        page: Page<ArtifactInfo>,
    },
    ArtifactData {
        data: ArtifactData,
    },
    Acknowledged,
    Error {
        error: ServiceError,
    },
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RequestEnvelope {
    pub api_version: u32,
    pub request_id: String,
    pub token: String,
    pub request: Request,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ResponseEnvelope {
    pub api_version: u32,
    pub request_id: String,
    pub response: Response,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Capabilities {
    pub api_version: u32,
    pub document_version: u32,
    pub platform: String,
    pub rendering: bool,
    pub exports: Vec<Container>,
    pub processors: Vec<String>,
    pub page_limit: usize,
    pub message_budget_bytes: usize,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProjectInfo {
    pub id: Uuid,
    pub name: String,
    pub revision: u64,
    pub active_sequence: Uuid,
    pub canvas: Canvas,
    pub recording_style: RecordingStyle,
    pub asset_count: usize,
    pub sequence_count: usize,
    pub can_undo: bool,
    pub can_redo: bool,
    pub can_project_undo: bool,
    pub can_project_redo: bool,
    pub recovered: bool,
    pub warnings: Vec<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SequenceInfo {
    pub id: Uuid,
    pub name: String,
    pub canvas: Canvas,
    pub recording_style: RecordingStyle,
    pub track_count: usize,
    pub clip_count: usize,
    pub duration_ms: u64,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AssetInfo {
    pub id: Uuid,
    pub name: String,
    pub duration_ms: u64,
    pub width: u32,
    pub height: u32,
    pub has_video: bool,
    pub has_audio: bool,
    pub is_image: bool,
    pub recording: bool,
    pub telemetry: Telemetry,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub identity: Option<crate::project::types::SourceIdentity>,
}
#[derive(Clone, Copy, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum Telemetry {
    Unknown,
    Separated,
    BakedIn,
    Absent,
}
#[derive(Clone, Copy, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum Container {
    Mp4,
    Webm,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GrantInfo {
    pub id: String,
    pub kind: GrantKind,
    pub name: String,
}
#[derive(Clone, Copy, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum GrantKind {
    Project,
    Source,
    Destination,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TimelineRegion {
    pub id: Uuid,
    pub target: super::ReadTarget,
    pub definition_id: String,
    pub definition_version: u32,
    pub name: Option<String>,
    pub kind: RegionKind,
    pub start: Time,
    pub end: Time,
    pub enabled: bool,
}
#[derive(Clone, Copy, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum RegionKind {
    Effect,
    Transition,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Event {
    pub revision: u64,
    pub sequence_id: Uuid,
    pub command_ids: Vec<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TransportInfo {
    pub position_ms: u64,
    pub duration_ms: u64,
    pub playing: bool,
    pub error: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ServiceError {
    pub code: ErrorCode,
    pub message: String,
    pub expected_revision: Option<u64>,
    pub actual_revision: Option<u64>,
}
#[derive(Clone, Copy, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum ErrorCode {
    InvalidRequest,
    Conflict,
    Unauthorized,
    Unsupported,
    Storage,
    Media,
    Stopped,
}

/// Trusted CLI bootstrap metadata, never a renderer-facing filesystem grant operation.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OwnerReady {
    pub endpoint: String,
    pub token_file: String,
    pub grants: OwnerGrants,
}
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OwnerGrants {
    pub project: String,
    pub sources: Vec<String>,
    pub destination: Option<String>,
}

/// Schema-only carrier ensures every public request, response and envelope is exported.
#[derive(JsonSchema)]
pub struct Contracts {
    pub track_overview: super::TrackOverview,
    pub job_context: super::JobContext,
    pub source_analysis: super::SourceAnalysis,
    pub proxy_settings: super::ProxySettings,
    pub clip_overview: super::view_types::ClipOverview,
    pub clip_header: crate::collections::headers::ClipHeader,
    pub request: Request,
    pub response: Response,
    pub request_envelope: RequestEnvelope,
    pub response_envelope: ResponseEnvelope,
    pub frame_rate: crate::timing::FrameRate,
    pub owner_ready: OwnerReady,
}
