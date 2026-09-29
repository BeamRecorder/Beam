//! Accepted commits wake attached hosts without an idle polling loop.
use super::change_types::{Changes, ProjectChanged};
impl Changes {
    pub fn set_consumer(&self, consumer: impl Fn(ProjectChanged) + Send + Sync + 'static) {
        *self.consumer.lock().unwrap_or_else(|p| p.into_inner()) =
            Some(std::sync::Arc::new(consumer));
    }
    pub(crate) fn publish(&self, document: &crate::Document) {
        let change = ProjectChanged {
            project_id: document.project.id,
            sequence_id: document.active_sequence,
            revision: document.revision,
        };
        {
            let mut previous = self.accepted.lock().unwrap_or_else(|p| p.into_inner());
            if previous.as_ref() == Some(&change) {
                return;
            }
            *previous = Some(change);
        }
        let consumer = self
            .consumer
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .clone();
        if let Some(consumer) = consumer
            && std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| consumer(change))).is_err()
        {
            eprintln!("Beam editor change consumer panicked after an accepted commit");
        }
    }
}
