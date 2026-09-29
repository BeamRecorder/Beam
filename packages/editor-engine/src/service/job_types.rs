//! Internal job locations stay behind the service boundary.
use beam_editor_domain::protocol::{ArtifactInfo, JobContext, JobInfo, SourceContext};
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    path::PathBuf,
    sync::{Arc, atomic::AtomicBool},
};
use uuid::Uuid;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct JobRecord {
    pub info: JobInfo,
    pub context: JobContext,
    pub fingerprint: String,
    pub artifacts: Vec<ArtifactInfo>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub import_publication: Option<beam_editor_domain::commands::import_types::ImportPublication>,
}
pub struct JobState {
    pub records: BTreeMap<Uuid, JobRecord>,
    pub cancellations: BTreeMap<Uuid, Arc<AtomicBool>>,
    pub threads: Vec<std::thread::JoinHandle<()>>,
}
pub enum JobOutput {
    Export(PathBuf),
    Preview,
}
pub(crate) enum JobWork {
    Render {
        project: crate::Project,
        output: JobOutput,
    },
    Analysis {
        project: crate::Project,
        document: Box<crate::Document>,
        context: SourceContext,
    },
    Proxy {
        project: crate::Project,
    },
    Import {
        document: Box<crate::Document>,
        context: beam_editor_domain::protocol::RenderContext,
        sources: Vec<super::import_job_types::ImportSource>,
        controller: Arc<crate::EditorController>,
    },
}
impl JobWork {
    pub(crate) fn project(&self) -> &crate::Project {
        match self {
            Self::Render { project, .. }
            | Self::Analysis { project, .. }
            | Self::Proxy { project, .. } => project,
            Self::Import { document, .. } => &document.project,
        }
    }
}
pub const ACTIVE_JOB_BUDGET: usize = 2;
