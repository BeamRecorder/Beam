//! A native decoder run retains the identities of every logical source cut.
use crate::Clip;
use std::sync::Arc;
use uuid::Uuid;

pub struct SourceRun {
    pub first: Arc<Clip>,
    pub duration_ms: u64,
    pub logical_ids: Vec<Uuid>,
}

pub(crate) struct SourceAllocation {
    pub count: usize,
    pub reused: bool,
}
