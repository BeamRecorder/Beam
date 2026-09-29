use super::*;

#[test]
fn clipboard_handlers_are_registered_without_opening_a_native_connection() {
    let registry = ServiceRegistry::with_builtins();
    let handlers = registry.handlers.lock().unwrap();
    for method in ["readText", "writeText"] {
        assert!(handlers.contains_key(&("clipboard".into(), method.into())));
    }
}

#[test]
fn clipboard_write_rejects_missing_text_before_opening_the_clipboard() {
    let registry = ServiceRegistry::with_builtins();
    let writer = registry
        .handlers
        .lock()
        .unwrap()
        .get(&("clipboard".into(), "writeText".into()))
        .unwrap()
        .clone();
    for payload in [Value::Null, json!({}), json!({ "message": "error" })] {
        assert!(
            matches!(writer(payload), ServiceOutcome::Error(message) if message == "clipboard.writeText requires text")
        );
    }
}

#[test]
fn clipboard_write_rejects_non_string_text_without_replacing_existing_content() {
    let registry = ServiceRegistry::with_builtins();
    let writer = registry
        .handlers
        .lock()
        .unwrap()
        .get(&("clipboard".into(), "writeText".into()))
        .unwrap()
        .clone();
    for text in [
        Value::Null,
        json!(42),
        json!(true),
        json!(["error"]),
        json!({ "text": "error" }),
    ] {
        assert!(
            matches!(writer(json!({ "text": text })), ServiceOutcome::Error(message) if message == "clipboard.writeText requires text")
        );
    }
}

#[test]
#[ignore = "requires ARGUI's private X11 compositor and xclip"]
fn copied_text_survives_the_service_worker_and_is_readable_by_another_process() {
    assert_eq!(std::env::var("ARGUI_HIDDEN_DISPLAY").as_deref(), Ok("1"));
    assert!(std::env::var("DISPLAY").is_ok());
    assert!(
        std::env::var("XDG_RUNTIME_DIR")
            .unwrap()
            .starts_with("/tmp/argui-display.")
    );
    let registry = Arc::new(ServiceRegistry::with_builtins());
    let (reply, received) = mpsc::channel();
    let text = "ServiceError: flux 3840 × 2160\nCopier l’erreur complète.";
    registry.submit(9, &json!({
        "requestId": 1, "window": "main", "service": "clipboard", "method": "writeText", "payload": { "text": text }
    }).to_string(), reply).unwrap();
    let result = received.recv_timeout(Duration::from_secs(5)).unwrap();
    assert!(matches!(result.outcome, ServiceOutcome::Ok(Value::Null)));
    assert!(!registry.has_pending(9));
    let copied = std::process::Command::new("timeout")
        .args(["5s", "xclip", "-selection", "clipboard", "-o"])
        .output()
        .unwrap();
    assert!(
        copied.status.success(),
        "{}",
        String::from_utf8_lossy(&copied.stderr)
    );
    assert_eq!(String::from_utf8(copied.stdout).unwrap(), text);
}
