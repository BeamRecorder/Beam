//! A notification describes accepted state; consumers query through the controller.
use std::sync::{Arc, Mutex};
use uuid::Uuid;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ProjectChanged {
    pub project_id: Uuid,
    pub sequence_id: Uuid,
    pub revision: u64,
}
pub type ChangeConsumer = Arc<dyn Fn(ProjectChanged) + Send + Sync>;
#[derive(Default)]
pub struct Changes {
    pub(crate) consumer: Mutex<Option<ChangeConsumer>>,
    pub(crate) accepted: Mutex<Option<ProjectChanged>>,
}
