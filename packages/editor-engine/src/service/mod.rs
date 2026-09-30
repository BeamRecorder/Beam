//! Single service shared by UI, broker, CLI and MCP; media stays on its actor.
pub mod artifacts;
pub mod grants;
mod import_job;
mod import_job_types;
mod import_start;
pub mod job_context;
pub mod job_runner;
pub mod job_snapshot;
mod job_start;
pub mod job_store;
pub mod job_types;
pub mod job_validation;
pub mod preview_render;
mod query;
pub mod source_render;
use crate::{EditorController, Result};
use beam_editor_domain::protocol::*;
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{Arc, Mutex},
};
pub struct EditorService {
    pub controller: Arc<EditorController>,
    pub grants: Arc<grants::GrantRegistry>,
    jobs: Mutex<HashMap<PathBuf, Arc<job_store::JobStore>>>,
    serial: Mutex<()>,
}
impl EditorService {
    pub fn new(controller: Arc<EditorController>, grants: Arc<grants::GrantRegistry>) -> Self {
        Self {
            controller,
            grants,
            jobs: Mutex::new(HashMap::new()),
            serial: Mutex::new(()),
        }
    }
    /// Serializes multi-operation requests with other clients of this owner.
    pub fn request(&self, request: Request) -> Result<Response> {
        let _guard = self.serial.lock().unwrap_or_else(|p| p.into_inner());
        match request {
            Request::Discovery => Ok(Response::Discovery {
                capabilities: self.capabilities(),
            }),
            Request::Schema => Ok(Response::Schema {
                schema: beam_editor_domain::protocol::schema()?,
            }),
            Request::GarbageCollect {
                project_id,
                expected_revision,
            } => {
                let pins = self.job_store()?.snapshot_pins()?;
                Ok(Response::GarbageCollection {
                    result: self
                        .controller
                        .garbage_collect(project_id, expected_revision, pins)?,
                })
            }
            Request::SealPack { pack } => Ok(Response::Pack { pack: pack.seal()? }),
            Request::Create {
                project_grant,
                name,
            } => {
                let root = self.grants.project(&project_grant)?;
                self.jobs_at(&root)?;
                let snapshot = self.controller.create(root, name)?;
                self.job_store()?.validate_project(snapshot.project.id)?;
                self.job_store()?
                    .recover_imports(&self.controller.document()?)?;
                Ok(Response::Project {
                    project: query::project(&snapshot),
                })
            }
            Request::Open { project_grant } => {
                let root = self.grants.project(&project_grant)?;
                self.jobs_at(&root)?;
                let snapshot = self.controller.open(root)?;
                self.job_store()?.validate_project(snapshot.project.id)?;
                self.job_store()?
                    .recover_imports(&self.controller.document()?)?;
                Ok(Response::Project {
                    project: query::project(&snapshot),
                })
            }
            Request::Import {
                context,
                source_grants,
            } => {
                let paths = source_grants
                    .iter()
                    .map(|id| self.grants.source(id))
                    .collect::<Result<_>>()?;
                let publication = self.controller.import_publication(context, paths)?;
                let snapshot = self.controller.snapshot()?;
                Ok(Response::Imported {
                    project: query::project(&snapshot),
                    publication,
                })
            }
            Request::ImportStart {
                context,
                source_grants,
            } => {
                let paths = source_grants
                    .iter()
                    .map(|id| self.grants.source(id))
                    .collect::<Result<_>>()?;
                Ok(Response::Job {
                    job: self.job_store()?.start_import(
                        self.controller.document()?,
                        context,
                        paths,
                        self.controller.clone(),
                    )?,
                })
            }
            Request::Relink {
                context,
                asset_id,
                source_grant,
                clip_ids,
            } => {
                let source = self.grants.source(&source_grant)?;
                self.controller
                    .relink(context, asset_id, clip_ids, source)
                    .map(|receipt| Response::Receipt { receipt })
            }
            Request::Query {
                query: Query::Grants { offset, limit },
            } => Ok(Response::Grants {
                page: beam_editor_domain::commands::query::page(
                    0,
                    &self.grants.list(),
                    offset,
                    limit,
                )?,
            }),
            Request::Query {
                query: Query::Jobs { offset, limit },
            } => Ok(Response::Jobs {
                page: self.job_store()?.jobs_page(
                    self.controller.document()?.revision,
                    offset,
                    limit,
                )?,
            }),
            Request::Query {
                query: Query::Artifacts { offset, limit },
            } => Ok(Response::Artifacts {
                page: self.job_store()?.artifacts_page(
                    self.controller.document()?.revision,
                    offset,
                    limit,
                )?,
            }),
            Request::Query { query } => query::read(&self.controller, query),
            Request::Transaction { transaction } => self
                .controller
                .transaction(transaction)
                .map(|receipt| Response::Receipt { receipt }),
            Request::ValidateTransaction { transaction } => self
                .controller
                .validate_transaction(transaction)
                .map(|receipt| Response::Receipt { receipt }),
            Request::Events {
                after_revision,
                limit,
            } => {
                let document = self.controller.document()?;
                Ok(Response::Events {
                    page: beam_editor_domain::commands::events::read(
                        &document,
                        after_revision,
                        limit,
                    )?,
                })
            }
            Request::Seek { position_ms } => {
                self.controller
                    .seek(position_ms)
                    .map(|t| Response::Transport {
                        transport: query::transport(t),
                    })
            }
            Request::Play { playing } => {
                self.controller.play(playing).map(|t| Response::Transport {
                    transport: query::transport(t),
                })
            }
            Request::Transport => self.controller.transport().map(|t| Response::Transport {
                transport: query::transport(t),
            }),
            Request::Export {
                context,
                destination_grant,
                file_name,
                container,
            } => {
                let destination = self
                    .grants
                    .destination_path(&destination_grant, &file_name)?;
                Ok(Response::Job {
                    job: self.job_store()?.start(
                        self.controller.document()?,
                        context,
                        JobKind::Export { container },
                        job_types::JobOutput::Export(destination),
                    )?,
                })
            }
            Request::PreviewRender {
                context,
                time,
                quality,
            } => Ok(Response::Job {
                job: self.job_store()?.start(
                    self.controller.document()?,
                    context,
                    JobKind::Preview { time, quality },
                    job_types::JobOutput::Preview,
                )?,
            }),
            Request::AnalysisStart { context, algorithm } => Ok(Response::Job {
                job: self.job_store()?.start_source(
                    self.controller.document()?,
                    context,
                    JobKind::Analysis { algorithm },
                )?,
            }),
            Request::ProxyStart { context, settings } => Ok(Response::Job {
                job: self.job_store()?.start_source(
                    self.controller.document()?,
                    context,
                    JobKind::Proxy { settings },
                )?,
            }),
            Request::JobGet { id } => Ok(Response::Job {
                job: self.job_store()?.get(id)?,
            }),
            Request::JobCancel { id } => Ok(Response::Job {
                job: self.job_store()?.cancel(id)?,
            }),
            Request::ArtifactRead { id, offset, length } => {
                let store = self.job_store()?;
                let artifact = store.artifact(id)?;
                Ok(Response::ArtifactData {
                    data: artifacts::read(&store.root, &artifact, offset, length)?,
                })
            }
        }
    }
    fn job_store(&self) -> Result<Arc<job_store::JobStore>> {
        let root = self.controller.project_root()?;
        let store = self.jobs_at(&root)?;
        store.validate_project(self.controller.document()?.project.id)?;
        Ok(store)
    }
    fn jobs_at(&self, root: &std::path::Path) -> Result<Arc<job_store::JobStore>> {
        let mut stores = self.jobs.lock().unwrap_or_else(|p| p.into_inner());
        if let Some(store) = stores.get(root) {
            return Ok(store.clone());
        }
        let store = job_store::JobStore::open(root)?;
        stores.insert(root.to_owned(), store.clone());
        Ok(store)
    }
    fn capabilities(&self) -> Capabilities {
        let rendering = crate::video::gpu::initialize().is_ok();
        let has = |factory: &str| rendering && gst::ElementFactory::find(factory).is_some();
        let processors = [
            ("colorBalance", "glcolorbalance"),
            ("transform", "glshader"),
            ("opacity", "glshader"),
            ("gain", "volume"),
            ("shader", "glshader"),
            ("crossfade", "glvideomixer"),
            ("wipe", "glvideomixer"),
            ("transitionShader", "glshader"),
            ("solid", "videotestsrc"),
            ("cameraZoom", "glshader"),
            ("cursor", "gloverlaycompositor"),
            ("framing", "glshader"),
            ("textPlacement", "textoverlay"),
        ]
        .into_iter()
        .filter(|(processor, factory)| {
            has(factory) && (*processor != "cursor" || has("overlaycomposition"))
        })
        .map(|(processor, _)| processor.to_owned())
        .collect();
        Capabilities {
            api_version: API_VERSION,
            document_version: beam_editor_domain::project::types::DOCUMENT_VERSION,
            platform: std::env::consts::OS.into(),
            rendering,
            processors,
            exports: crate::export::profile::available()
                .into_iter()
                .map(|format| match format.container {
                    crate::export::types::Container::Mp4 => Container::Mp4,
                    crate::export::types::Container::Webm => Container::Webm,
                })
                .collect(),
            page_limit: beam_editor_domain::commands::query::PAGE_LIMIT,
            message_budget_bytes: MESSAGE_BUDGET,
        }
    }
}
impl Drop for EditorService {
    fn drop(&mut self) {
        for store in self
            .jobs
            .get_mut()
            .unwrap_or_else(|p| p.into_inner())
            .values()
        {
            store.shutdown();
        }
    }
}
