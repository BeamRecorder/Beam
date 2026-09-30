//! Keeps the native UI and programmable clients on the same project owner.
use beam_editor_engine::domain::protocol::{JobPhase, RenderContext, Request, Response};
use beam_editor_engine::video::types::EditorSnapshot;
use beam_editor_engine::{
    EditorController, broker,
    service::{EditorService, grants::GrantRegistry},
};
use std::{
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};

pub(super) struct Session {
    pub controller: Arc<EditorController>,
    pub service: Arc<EditorService>,
    owner: Mutex<Option<broker::Broker>>,
    export_job: Mutex<Option<uuid::Uuid>>,
    cursor_defaults: Option<beam_editor_engine::domain::recording::style_types::CursorStyle>,
}
impl Session {
    pub fn new(
        controller: Arc<EditorController>,
        cursor_defaults: Option<beam_editor_engine::domain::recording::style_types::CursorStyle>,
    ) -> Self {
        let service = Arc::new(EditorService::new(
            controller.clone(),
            Arc::new(GrantRegistry::default()),
        ));
        Self {
            controller,
            service,
            owner: Mutex::new(None),
            export_job: Mutex::new(None),
            cursor_defaults,
        }
    }
    pub fn create(&self, root: PathBuf, name: String) -> Result<EditorSnapshot, String> {
        self.load(root, Some(name))
    }
    /// The process launcher configures paths; renderer payloads contain only grants.
    pub fn configure(&self, args: impl IntoIterator<Item = String>) -> Result<(), String> {
        for argument in args {
            if let Some(path) = argument.strip_prefix("--editor-source=") {
                self.service
                    .grants
                    .authorize_source(Path::new(path))
                    .map_err(|e| e.to_string())?;
            } else if let Some(path) = argument.strip_prefix("--editor-destination=") {
                self.service
                    .grants
                    .authorize_destination(Path::new(path))
                    .map_err(|e| e.to_string())?;
            }
        }
        Ok(())
    }
    pub fn open(&self, root: PathBuf) -> Result<EditorSnapshot, String> {
        self.load(root, None)
    }
    fn load(&self, root: PathBuf, name: Option<String>) -> Result<EditorSnapshot, String> {
        let seed = self.cursor_defaults.as_ref().filter(|_| {
            !root.join("editor.beam.json").exists()
                && !root.join("editor.beam.previous.json").exists()
        });
        let seed = if seed.is_some()
            && beam_editor_engine::project::cursor_preferences::has_recorded_profile(&root)
                .map_err(|e| e.to_string())?
        {
            None
        } else {
            seed
        };
        let mut owner = self.owner.lock().unwrap_or_else(|p| p.into_inner());
        // Join clients before replacing the project they were attached to.
        drop(owner.take());
        let grant = self
            .service
            .grants
            .authorize_project(&root)
            .map_err(|e| e.to_string())?;
        let request = match name {
            Some(name) => Request::Create {
                project_grant: grant.clone(),
                name,
            },
            None => Request::Open {
                project_grant: grant.clone(),
            },
        };
        let result = self.service.request(request).map_err(|e| e.to_string());
        self.service.grants.revoke(&grant);
        // A failed open retains the previously accepted project; restore its endpoint too.
        if let Ok(root) = self.controller.project_root() {
            let endpoint = broker::endpoint_for(&root).map_err(|e| e.to_string())?;
            *owner =
                Some(broker::serve(endpoint, self.service.clone()).map_err(|e| e.to_string())?);
        }
        result?;
        if let Some(cursor) = seed {
            let snapshot = self.controller.snapshot().map_err(|e| e.to_string())?;
            let mut style = snapshot.project.recording_style;
            style.cursor = cursor.clone();
            self.controller
                .edit(
                    snapshot.revision,
                    beam_editor_engine::Edit::RecordingStyle { style },
                )
                .map_err(|e| e.to_string())?;
        }
        *self.export_job.lock().unwrap_or_else(|p| p.into_inner()) = None;
        self.controller.snapshot().map_err(|e| e.to_string())
    }
    pub fn import(&self, paths: Vec<PathBuf>) -> Result<EditorSnapshot, String> {
        let document = self.controller.document().map_err(|e| e.to_string())?;
        let context = RenderContext {
            project_id: document.project.id,
            sequence_id: document.active_sequence,
            expected_revision: document.revision,
            idempotency_key: uuid::Uuid::new_v4().to_string(),
        };
        let mut grants = vec![];
        for path in paths {
            match self.service.grants.authorize_source(&path) {
                Ok(grant) => grants.push(grant),
                Err(error) => {
                    for grant in grants {
                        self.service.grants.revoke(&grant);
                    }
                    return Err(error.to_string());
                }
            }
        }
        let result = self.service.request(Request::Import {
            context,
            source_grants: grants.clone(),
        });
        for grant in grants {
            self.service.grants.revoke(&grant);
        }
        result.map_err(|e| e.to_string())?;
        self.controller.snapshot().map_err(|e| e.to_string())
    }
    pub fn export(
        &self,
        path: &Path,
        container: beam_editor_engine::export::types::Container,
    ) -> Result<(), String> {
        let directory = path.parent().ok_or("export has no directory")?;
        let file_name = path
            .file_name()
            .and_then(|v| v.to_str())
            .ok_or("export filename is not UTF-8")?
            .to_owned();
        let document = self.controller.document().map_err(|e| e.to_string())?;
        let grant = self
            .service
            .grants
            .authorize_destination(directory)
            .map_err(|e| e.to_string())?;
        let context = RenderContext {
            project_id: document.project.id,
            sequence_id: document.active_sequence,
            expected_revision: document.revision,
            idempotency_key: uuid::Uuid::new_v4().to_string(),
        };
        let result = self.service.request(Request::Export {
            context,
            destination_grant: grant.clone(),
            file_name,
            container: match container {
                beam_editor_engine::export::types::Container::Mp4 => {
                    beam_editor_engine::domain::protocol::Container::Mp4
                }
                beam_editor_engine::export::types::Container::Webm => {
                    beam_editor_engine::domain::protocol::Container::Webm
                }
            },
        });
        self.service.grants.revoke(&grant);
        match result.map_err(|e| e.to_string())? {
            Response::Job { job } => {
                *self.export_job.lock().unwrap_or_else(|p| p.into_inner()) = Some(job.id);
                Ok(())
            }
            _ => Err("export returned an unexpected response".into()),
        }
    }
    pub fn export_status(&self) -> Result<beam_editor_engine::export::types::ExportStatus, String> {
        use beam_editor_engine::export::types::{ExportPhase, ExportStatus};
        let Some(id) = *self.export_job.lock().unwrap_or_else(|p| p.into_inner()) else {
            return Ok(ExportStatus::default());
        };
        match self
            .service
            .request(Request::JobGet { id })
            .map_err(|e| e.to_string())?
        {
            Response::Job { job } => Ok(ExportStatus {
                phase: match job.phase {
                    JobPhase::Queued | JobPhase::Rendering => ExportPhase::Rendering,
                    JobPhase::Completed => ExportPhase::Completed,
                    JobPhase::Cancelled => ExportPhase::Cancelled,
                    JobPhase::Failed => ExportPhase::Failed,
                },
                progress: job.progress,
                error: job.error,
            }),
            _ => Err("job status returned an unexpected response".into()),
        }
    }
    pub fn cancel_export(&self) -> Result<(), String> {
        if let Some(id) = *self.export_job.lock().unwrap_or_else(|p| p.into_inner()) {
            self.service
                .request(Request::JobCancel { id })
                .map_err(|e| e.to_string())?;
        }
        Ok(())
    }
}
