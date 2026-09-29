//! Scoped ownership of an actor's wake handle, event routes, and pending operations.

use super::ServiceRegistry;
use std::sync::Arc;

pub(crate) struct ActorSession {
    registry: Arc<ServiceRegistry>,
    generation: u32,
}

impl ActorSession {
    pub(crate) fn new(registry: Arc<ServiceRegistry>, generation: u32) -> Self {
        registry.register_actor(generation);
        Self {
            registry,
            generation,
        }
    }
}

impl Drop for ActorSession {
    fn drop(&mut self) {
        self.registry.cancel_session(self.generation);
    }
}
