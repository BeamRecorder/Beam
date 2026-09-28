//! Event fan-out and sleeping actor wakeups.

use super::{ServiceOutcome, ServiceRegistry, ServiceResponse};
use serde_json::Value;
use std::sync::mpsc::Sender;

impl ServiceRegistry {
    /// Associates a mounted scene with its independent response channel.
    pub(crate) fn register_session(
        &self,
        session: u32,
        window: &str,
        reply: Sender<ServiceResponse>,
    ) {
        self.event_routes
            .lock()
            .unwrap_or_else(|poison| poison.into_inner())
            .insert((session, window.into()), reply);
    }

    /// Registers the current actor thread so work wakes it without idle polling.
    pub(crate) fn register_actor(&self, session: u32) {
        self.actor_wakes
            .lock()
            .unwrap_or_else(|poison| poison.into_inner())
            .insert(session, std::thread::current());
    }

    /// Wakes the live actor belonging to `session`; an unmounted scene is a no-op.
    pub(crate) fn wake_actor(&self, session: u32) {
        if let Some(actor) = self
            .actor_wakes
            .lock()
            .unwrap_or_else(|poison| poison.into_inner())
            .get(&session)
        {
            actor.unpark();
        }
    }

    /// Releases sleeping scene threads after the shared stop flag is set.
    pub(crate) fn wake_all_actors(&self) {
        for actor in self
            .actor_wakes
            .lock()
            .unwrap_or_else(|poison| poison.into_inner())
            .values()
        {
            actor.unpark();
        }
    }

    /// Wakes all current generations attached to a named window.
    pub(crate) fn wake_window(&self, window: &str) {
        for ((session, _), _) in self
            .event_routes
            .lock()
            .unwrap_or_else(|poison| poison.into_inner())
            .iter()
            .filter(|((_, key), _)| key == window)
        {
            self.wake_actor(*session);
        }
    }

    /// Sends an event to every registered scene, including hidden presentations.
    pub(crate) fn broadcast_event(&self, value: &Value) {
        self.send_event(value, None);
    }

    /// Routes an unsolicited event directly to its owning scene.
    pub(crate) fn route_event(&self, response: &ServiceResponse) {
        if let ServiceOutcome::Event(value) = &response.outcome {
            self.send_event(value, Some(&response.window));
        }
    }

    /// Publishes a value to matching channels and retains each actor's wake token.
    fn send_event(&self, value: &Value, target: Option<&str>) {
        for ((session, window), channel) in self
            .event_routes
            .lock()
            .unwrap_or_else(|poison| poison.into_inner())
            .iter()
        {
            if target.is_some_and(|key| key != window) {
                continue;
            }
            let _ = channel.send(ServiceResponse {
                session: *session,
                window: window.clone(),
                request_id: 0,
                outcome: ServiceOutcome::Event(value.clone()),
            });
            self.wake_actor(*session);
        }
    }
}
