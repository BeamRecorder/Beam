use super::*;
use crate::services::ActorSession;
use std::panic::{AssertUnwindSafe, catch_unwind};

fn registered(registry: &ServiceRegistry, generation: u32) -> bool {
    registry
        .actor_wakes
        .lock()
        .unwrap()
        .contains_key(&generation)
}

#[test]
fn scoped_actor_cleanup_runs_after_success_error_and_unwind() {
    for exit in ["success", "error", "unwind"] {
        let registry = Arc::new(ServiceRegistry::new());
        let generation = 17;
        let (sender, events) = mpsc::channel();
        registry.register_session(generation, "settings", sender);
        let cancelled = Arc::new(AtomicBool::new(false));
        registry
            .pending
            .lock()
            .unwrap()
            .insert((generation, "settings".into(), 1), Arc::clone(&cancelled));
        let result = catch_unwind(AssertUnwindSafe(|| -> Result<(), &str> {
            let _session = ActorSession::new(Arc::clone(&registry), generation);
            assert!(registered(&registry, generation));
            match exit {
                "error" => Err("initialization or delivery failed"),
                "unwind" => std::panic::resume_unwind(Box::new("actor panicked")),
                _ => Ok(()),
            }
        }));
        assert_eq!(result.is_err(), exit == "unwind");
        assert!(!registered(&registry, generation));
        assert!(!registry.has_pending(generation));
        assert!(cancelled.load(Ordering::Acquire));
        assert!(registry.event_routes.lock().unwrap().is_empty());
        assert!(events.try_recv().is_err());
    }
}

#[test]
fn cleanup_of_one_actor_keeps_another_session_alive() {
    let registry = Arc::new(ServiceRegistry::new());
    let first = ActorSession::new(Arc::clone(&registry), 1);
    let second = ActorSession::new(Arc::clone(&registry), 2);
    let (sender, events) = mpsc::channel();
    registry.register_session(2, "recorder", sender);
    let pending = Arc::new(AtomicBool::new(false));
    registry
        .pending
        .lock()
        .unwrap()
        .insert((2, "recorder".into(), 1), Arc::clone(&pending));
    drop(first);
    assert!(!registered(&registry, 1));
    assert!(registered(&registry, 2));
    assert!(registry.has_pending(2));
    assert!(!pending.load(Ordering::Acquire));
    registry.route_event(&ServiceResponse {
        session: u32::MAX,
        window: "recorder".into(),
        request_id: 0,
        outcome: ServiceOutcome::Event(json!({ "type": "recording" })),
    });
    assert_eq!(events.try_recv().unwrap().session, 2);
    drop(second);
    assert!(pending.load(Ordering::Acquire));
}
