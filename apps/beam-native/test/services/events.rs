use super::*;

#[test]
fn preference_snapshots_reach_every_live_scene_including_hidden_windows() {
    let registry = ServiceRegistry::new();
    let event = json!({"type":"preferencesChanged", "preferences":{"theme":"light"}});
    let mut receivers = Vec::new();
    for (generation, window) in [(1, "main"), (5, "settings"), (6, "recorder")] {
        let (sender, receiver) = mpsc::channel();
        registry.register_session(generation, window, sender);
        receivers.push((generation, window, receiver));
    }
    registry.broadcast_event(&event);
    for (generation, window, receiver) in receivers {
        let response = receiver.recv_timeout(Duration::from_secs(1)).unwrap();
        assert_eq!(response.session, generation);
        assert_eq!(response.window, window);
        assert!(matches!(response.outcome, ServiceOutcome::Event(value) if value == event));
        assert!(receiver.try_recv().is_err());
    }
}

#[test]
fn closed_generations_do_not_receive_broadcasts_after_replacement() {
    let registry = ServiceRegistry::new();
    let (old, old_events) = mpsc::channel();
    let (new, new_events) = mpsc::channel();
    registry.register_session(1, "main", old);
    registry.cancel_session(1);
    registry.register_session(2, "main", new);
    registry.broadcast_event(&json!({"type":"preferencesChanged"}));
    assert!(old_events.try_recv().is_err());
    assert_eq!(
        new_events
            .recv_timeout(Duration::from_secs(1))
            .unwrap()
            .session,
        2
    );
}

#[test]
fn an_event_wakes_a_parked_actor_before_its_idle_timeout() {
    let registry = Arc::new(ServiceRegistry::new());
    let (events, responses) = mpsc::channel();
    registry.register_session(8, "settings", events);
    let (ready, waiting) = mpsc::channel();
    let (done, completed) = mpsc::channel();
    let actor_registry = Arc::clone(&registry);
    let actor = std::thread::spawn(move || {
        actor_registry.register_actor(8);
        ready.send(()).unwrap();
        std::thread::park_timeout(Duration::from_secs(5));
        let event = responses.try_recv().unwrap();
        done.send(event.session).unwrap();
    });
    waiting.recv_timeout(Duration::from_secs(1)).unwrap();
    registry.broadcast_event(&json!({"type":"preferencesChanged"}));
    assert_eq!(completed.recv_timeout(Duration::from_secs(1)).unwrap(), 8);
    actor.join().unwrap();
    registry.cancel_session(8);
}
