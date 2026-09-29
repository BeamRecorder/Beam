//! Durable metadata, immutable decision pins and restart recovery.
use super::job_types::{JobRecord, JobState};
use crate::{EditorError, Result};
use beam_editor_domain::protocol::*;
use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
    sync::{Arc, Mutex, atomic::Ordering},
};
use uuid::Uuid;

pub struct JobStore {
    pub(crate) root: PathBuf,
    pub(crate) state: Mutex<JobState>,
}
impl JobStore {
    pub fn open(root: &Path) -> Result<Arc<Self>> {
        let folder = super::artifacts::managed_directory(root, "jobs")?;
        let mut records = BTreeMap::new();
        let mut keys = std::collections::HashSet::new();
        let mut artifact_ids = std::collections::HashSet::new();
        for entry in fs::read_dir(&folder).map_err(|e| crate::shared::storage(&folder, e))? {
            let entry = entry.map_err(|e| crate::shared::storage(&folder, e))?;
            let name = entry.file_name().to_string_lossy().into_owned();
            if name.starts_with('.') {
                continue;
            }
            let id = name
                .strip_suffix(".json")
                .and_then(|value| Uuid::parse_str(value).ok())
                .ok_or_else(|| EditorError::Invalid("invalid job record filename".into()))?;
            if name != format!("{id}.json") {
                return Err(EditorError::Invalid(
                    "job record filename must use its canonical ID".into(),
                ));
            }
            if !entry
                .file_type()
                .map_err(|e| crate::shared::storage(entry.path(), e))?
                .is_file()
            {
                return Err(EditorError::Invalid(
                    "job record is not a regular file".into(),
                ));
            }
            let mut record: JobRecord = serde_json::from_slice(
                &beam_editor_domain::project::blocks::read_bytes(&entry.path())?,
            )?;
            super::job_validation::record(&record)?;
            if !keys.insert(super::job_context::key(&record.context).to_owned())
                || record
                    .artifacts
                    .iter()
                    .any(|artifact| !artifact_ids.insert(artifact.id))
            {
                return Err(EditorError::Invalid(
                    "job metadata repeats a durable request or artifact identity".into(),
                ));
            }
            if record.info.id != id {
                return Err(EditorError::Invalid(
                    "job record identity is inconsistent".into(),
                ));
            }
            if matches!(record.info.phase, JobPhase::Queued | JobPhase::Rendering) {
                record.info.phase = JobPhase::Failed;
                record.info.error = Some(
                    "owner stopped before this job completed; start a new job to retry".into(),
                );
                write(&folder, &record)?;
            }
            records.insert(id, record);
        }
        Ok(Arc::new(Self {
            root: root.to_owned(),
            state: Mutex::new(JobState {
                records,
                cancellations: BTreeMap::new(),
                threads: vec![],
            }),
        }))
    }
    pub fn get(&self, id: Uuid) -> Result<JobInfo> {
        self.state
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .records
            .get(&id)
            .map(|record| record.info.clone())
            .ok_or_else(|| EditorError::Invalid("job was not found in this project".into()))
    }
    pub fn jobs(&self) -> Vec<JobInfo> {
        self.state
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .records
            .values()
            .map(|r| r.info.clone())
            .collect()
    }
    pub fn artifacts(&self) -> Vec<ArtifactInfo> {
        self.state
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .records
            .values()
            .flat_map(|r| r.artifacts.clone())
            .collect()
    }
    pub fn jobs_page(
        &self,
        revision: u64,
        offset: usize,
        limit: usize,
    ) -> Result<beam_editor_domain::commands::types::Page<JobInfo>> {
        let state = self.state.lock().unwrap_or_else(|p| p.into_inner());
        bounded_page(
            revision,
            state.records.len(),
            state.records.values().map(|record| &record.info),
            offset,
            limit,
        )
    }
    pub fn artifacts_page(
        &self,
        revision: u64,
        offset: usize,
        limit: usize,
    ) -> Result<beam_editor_domain::commands::types::Page<ArtifactInfo>> {
        let state = self.state.lock().unwrap_or_else(|p| p.into_inner());
        let total = state
            .records
            .values()
            .map(|record| record.artifacts.len())
            .sum();
        bounded_page(
            revision,
            total,
            state.records.values().flat_map(|record| &record.artifacts),
            offset,
            limit,
        )
    }
    pub fn artifact(&self, id: Uuid) -> Result<ArtifactInfo> {
        self.state
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .records
            .values()
            .flat_map(|record| &record.artifacts)
            .find(|artifact| artifact.id == id)
            .cloned()
            .ok_or_else(|| EditorError::Invalid("artifact was not found in this project".into()))
    }
    pub fn validate_project(&self, project_id: Uuid) -> Result<()> {
        if self
            .state
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .records
            .values()
            .any(|record| record.info.project_id != project_id)
        {
            return Err(EditorError::Invalid(
                "job records belong to a different project".into(),
            ));
        }
        Ok(())
    }
    pub fn snapshot_pins(&self) -> Result<Vec<String>> {
        let state = self.state.lock().unwrap_or_else(|p| p.into_inner());
        if state
            .records
            .values()
            .any(|record| matches!(record.info.phase, JobPhase::Queued | JobPhase::Rendering))
        {
            return Err(EditorError::Invalid(
                "finish or cancel active jobs before collecting decision blocks".into(),
            ));
        }
        Ok(state
            .records
            .values()
            .filter_map(|record| record.info.snapshot_id.clone())
            .collect())
    }
    pub fn cancel(&self, id: Uuid) -> Result<JobInfo> {
        let state = self.state.lock().unwrap_or_else(|p| p.into_inner());
        let record = state
            .records
            .get(&id)
            .ok_or_else(|| EditorError::Invalid("job was not found in this project".into()))?;
        if let Some(cancel) = state.cancellations.get(&id) {
            cancel.store(true, Ordering::Release);
        }
        Ok(record.info.clone())
    }
    pub(crate) fn update(&self, id: Uuid, change: impl FnOnce(&mut JobRecord)) -> Result<()> {
        let mut state = self.state.lock().unwrap_or_else(|p| p.into_inner());
        let record = state
            .records
            .get_mut(&id)
            .ok_or_else(|| EditorError::Invalid("job was not found".into()))?;
        let mut candidate = record.clone();
        change(&mut candidate);
        let persisted = super::artifacts::managed_directory(&self.root, "jobs")
            .and_then(|folder| write(&folder, &candidate));
        if let Err(error) = persisted {
            record.info.phase = JobPhase::Failed;
            record.info.error = Some(error.to_string());
            record.info.artifacts.clear();
            record.artifacts.clear();
            if let Err(failure) = super::artifacts::managed_directory(&self.root, "jobs")
                .and_then(|folder| write(&folder, record))
            {
                eprintln!("job {id} failure metadata could not be persisted: {failure}");
            }
            return Err(error);
        }
        *record = candidate;
        Ok(())
    }
    pub fn shutdown(&self) {
        let threads = {
            let mut state = self.state.lock().unwrap_or_else(|p| p.into_inner());
            for cancel in state.cancellations.values() {
                cancel.store(true, Ordering::Release);
            }
            std::mem::take(&mut state.threads)
        };
        for thread in threads {
            let _ = thread.join();
        }
    }
}
fn bounded_page<'a, T: Clone + 'a>(
    revision: u64,
    total: usize,
    values: impl Iterator<Item = &'a T>,
    offset: usize,
    limit: usize,
) -> Result<beam_editor_domain::commands::types::Page<T>> {
    if limit == 0 || limit > beam_editor_domain::commands::query::PAGE_LIMIT || offset > total {
        return Err(EditorError::Invalid(
            "page requires limit 1–256 and a valid offset".into(),
        ));
    }
    let items = values.skip(offset).take(limit).cloned().collect::<Vec<_>>();
    let end = offset.saturating_add(items.len());
    Ok(beam_editor_domain::commands::types::Page {
        revision,
        total,
        next: (end < total).then_some(end),
        items,
    })
}
pub(crate) fn write(folder: &Path, record: &JobRecord) -> Result<()> {
    super::job_validation::record(record)?;
    let path = folder.join(format!("{}.json", record.info.id));
    if path
        .symlink_metadata()
        .is_ok_and(|metadata| !metadata.is_file() || metadata.file_type().is_symlink())
    {
        return Err(EditorError::Invalid(
            "job record was replaced by a nonregular file".into(),
        ));
    }
    beam_media_manifest::write_atomic(&path, &serde_json::to_vec(record)?)
        .map_err(|error| EditorError::Invalid(error.to_string()))
}
