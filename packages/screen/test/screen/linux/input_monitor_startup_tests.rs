#![cfg(test)]
#![allow(clippy::expect_used, clippy::panic)]

use std::{
    io::{BufRead, BufReader},
    process::{Child, ChildStdout, Command, Stdio},
    time::{Duration, Instant},
};

use super::super::{input_helper_diagnostics::HelperDiagnostics, owned_child};
use super::{
    BrokerShared, INPUT_QUEUE_CAPACITY, InputEventQueue, LinuxInputBroker, LinuxInputMonitor,
    dispatch_input_line, failed_startup, linux_input_access_status_from, parse_ready_counts,
    read_input_lines,
};

#[path = "input_monitor_lines.rs"]
mod line_tests;

#[test]
fn readiness_parser_rejects_invalid_json_and_non_ready_events() {
    for line in [
        "",
        "not-json",
        "[]",
        "{}",
        r#"{"event":"event"}"#,
        r#"{"event":null}"#,
        r#"{"event":1}"#,
    ] {
        let error = parse_ready_counts(line).expect_err("invalid readiness");
        assert!(!error.is_empty(), "{line}");
    }
    assert!(
        parse_ready_counts("{")
            .expect_err("bad JSON")
            .contains("readiness JSON")
    );
    assert!(
        parse_ready_counts(r#"{"event":"event"}"#)
            .expect_err("wrong event")
            .contains("invalid readiness response")
    );
}

#[test]
fn readiness_parser_defaults_invalid_counts_independently_and_accepts_bounds() {
    for (line, expected) in [
        (r#"{"event":"ready"}"#, (0, 0)),
        (
            r#"{"event":"ready","mouseDevices":0,"keyboardDevices":0}"#,
            (0, 0),
        ),
        (
            r#"{"event":"ready","mouseDevices":2,"keyboardDevices":3}"#,
            (2, 3),
        ),
        (
            r#"{"event":"ready","mouseDevices":-1,"keyboardDevices":4}"#,
            (0, 4),
        ),
        (
            r#"{"event":"ready","mouseDevices":"2","keyboardDevices":true}"#,
            (0, 0),
        ),
        (
            r#"{"event":"ready","mouseDevices":1.5,"keyboardDevices":null}"#,
            (0, 0),
        ),
        (
            r#"{"event":"ready","mouseDevices":{},"keyboardDevices":[]}"#,
            (0, 0),
        ),
    ] {
        assert_eq!(parse_ready_counts(line), Ok(expected), "{line}");
    }
    let maximum = format!(
        r#"{{"event":"ready","mouseDevices":{},"keyboardDevices":{}}}"#,
        usize::MAX,
        usize::MAX
    );
    assert_eq!(parse_ready_counts(&maximum), Ok((usize::MAX, usize::MAX)));
    #[cfg(target_pointer_width = "32")]
    assert_eq!(
        parse_ready_counts(r#"{"event":"ready","mouseDevices":4294967296,"keyboardDevices":1}"#),
        Ok((0, 1))
    );
}

#[test]
fn dispatch_ignores_malformed_events_and_prunes_dead_subscribers() {
    use std::sync::{Arc, Mutex};
    let shared = BrokerShared::default();
    let active = Arc::new(Mutex::new(InputEventQueue::default()));
    let dead = Arc::new(Mutex::new(InputEventQueue::default()));
    {
        let mut subscribers = shared.subscribers.lock().expect("subscribers");
        subscribers.push(Arc::downgrade(&dead));
        subscribers.push(Arc::downgrade(&active));
    }
    drop(dead);
    for line in [
        "",
        "{}",
        r#"{"event":"unknown"}"#,
        r#"{"event":"mouse-button","monotonicNs":1,"button":"left","pressed":true}"#,
    ] {
        dispatch_input_line(&shared, line);
    }
    assert!(active.lock().expect("queue").events.is_empty());
    assert_eq!(shared.subscribers.lock().expect("subscribers").len(), 2);
    dispatch_input_line(
        &shared,
        r#"{"event":"mouse-button","monotonicNs":11,"button":1,"pressed":true}"#,
    );
    assert_eq!(shared.subscribers.lock().expect("subscribers").len(), 1);
    let queue = active.lock().expect("queue");
    assert_eq!(queue.events.len(), 1);
    assert_eq!(queue.events[0].monotonic_ns(), 11);
}

#[test]
fn dispatch_preserves_order_across_subscribers_and_isolates_stopped_queue() {
    use std::sync::{Arc, Mutex};
    let shared = BrokerShared::default();
    let first = Arc::new(Mutex::new(InputEventQueue::default()));
    let second = Arc::new(Mutex::new(InputEventQueue::default()));
    let stopped = Arc::new(Mutex::new(InputEventQueue::default()));
    stopped.lock().expect("stopped queue").accepting = false;
    shared.subscribers.lock().expect("subscribers").extend([
        Arc::downgrade(&first),
        Arc::downgrade(&stopped),
        Arc::downgrade(&second),
    ]);
    for line in [
        r#"{"event":"mouse-motion","monotonicNs":1,"deltaX":2,"deltaY":3}"#,
        r#"{"event":"mouse-button","monotonicNs":2,"button":1,"pressed":true}"#,
        r#"{"event":"mouse-button","monotonicNs":3,"button":1,"pressed":false}"#,
    ] {
        dispatch_input_line(&shared, line);
    }
    for subscriber in [first, second] {
        let timestamps: Vec<_> = subscriber
            .lock()
            .expect("queue")
            .events
            .iter()
            .map(|event| event.monotonic_ns())
            .collect();
        assert_eq!(timestamps, [1, 2, 3]);
    }
    assert!(stopped.lock().expect("queue").events.is_empty());
}

#[test]
fn dispatch_honors_queue_capacity_without_affecting_other_subscribers() {
    use crate::input::NativeInputEvent;
    use std::sync::{Arc, Mutex};
    let shared = BrokerShared::default();
    let full = Arc::new(Mutex::new(InputEventQueue::default()));
    let empty = Arc::new(Mutex::new(InputEventQueue::default()));
    {
        let mut queue = full.lock().expect("queue");
        queue
            .events
            .extend((0..INPUT_QUEUE_CAPACITY as u64).map(|monotonic_ns| {
                NativeInputEvent::MouseButton {
                    monotonic_ns,
                    button: 1,
                    pressed: true,
                }
            }));
    }
    shared
        .subscribers
        .lock()
        .expect("subscribers")
        .extend([Arc::downgrade(&full), Arc::downgrade(&empty)]);
    dispatch_input_line(
        &shared,
        r#"{"event":"mouse-button","monotonicNs":99999,"button":2,"pressed":false}"#,
    );
    let full = full.lock().expect("full queue");
    assert_eq!(full.events.len(), INPUT_QUEUE_CAPACITY);
    assert_eq!(
        full.events.front().map(NativeInputEvent::monotonic_ns),
        Some(1)
    );
    assert_eq!(
        full.events.back().map(NativeInputEvent::monotonic_ns),
        Some(99999)
    );
    let empty = empty.lock().expect("empty queue");
    assert_eq!(empty.events.len(), 1);
    assert_eq!(empty.events[0].monotonic_ns(), 99999);
}

#[test]
fn poisoned_subscriber_registry_does_not_deliver_or_crash_dispatch() {
    use std::sync::{Arc, Mutex};
    let shared = Arc::new(BrokerShared::default());
    let queue = Arc::new(Mutex::new(InputEventQueue::default()));
    shared
        .subscribers
        .lock()
        .expect("subscribers")
        .push(Arc::downgrade(&queue));
    let other = shared.clone();
    let result = std::thread::spawn(move || {
        let _guard = other.subscribers.lock().expect("subscribers");
        panic!("poison registry fixture");
    })
    .join();
    assert!(result.is_err());
    dispatch_input_line(
        &shared,
        r#"{"event":"mouse-button","monotonicNs":1,"button":1,"pressed":true}"#,
    );
    assert!(queue.lock().expect("queue").events.is_empty());
}

#[test]
fn poisoned_queue_does_not_block_delivery_to_other_subscribers() {
    use std::sync::{Arc, Mutex};
    let shared = BrokerShared::default();
    let poisoned = Arc::new(Mutex::new(InputEventQueue::default()));
    let healthy = Arc::new(Mutex::new(InputEventQueue::default()));
    shared
        .subscribers
        .lock()
        .expect("subscribers")
        .extend([Arc::downgrade(&poisoned), Arc::downgrade(&healthy)]);
    let other = poisoned.clone();
    assert!(
        std::thread::spawn(move || {
            let _guard = other.lock().expect("queue");
            panic!("poison queue fixture");
        })
        .join()
        .is_err()
    );
    dispatch_input_line(
        &shared,
        r#"{"event":"mouse-button","monotonicNs":2,"button":1,"pressed":true}"#,
    );
    assert_eq!(shared.subscribers.lock().expect("subscribers").len(), 2);
    assert_eq!(healthy.lock().expect("queue").events.len(), 1);
    let mut monitor = LinuxInputMonitor { queue: poisoned };
    assert!(monitor.drain().is_empty());
    monitor.stop();
}

#[test]
fn stopping_broker_with_poisoned_registry_still_clears_ready_and_failure() {
    use std::sync::{Arc, atomic::Ordering};
    let mut broker = LinuxInputBroker::default();
    broker.shared.ready.store(true, Ordering::Release);
    broker.last_failure = Some(crate::input::InputAccessStatus::failed(
        &crate::CaptureError::Backend("old".into()),
    ));
    let other = Arc::clone(&broker.shared);
    assert!(
        std::thread::spawn(move || {
            let _guard = other.subscribers.lock().expect("subscribers");
            panic!("poison broker registry");
        })
        .join()
        .is_err()
    );
    broker.stop();
    assert!(!broker.shared.ready.load(Ordering::Acquire));
    assert!(broker.last_failure.is_none());
}

#[test]
fn local_monitor_and_broker_stop_are_idempotent() {
    use std::sync::{Arc, Mutex, atomic::Ordering};
    let queue = Arc::new(Mutex::new(InputEventQueue::default()));
    let mut monitor = LinuxInputMonitor {
        queue: queue.clone(),
    };
    monitor.stop();
    monitor.stop();
    assert!(!queue.lock().expect("queue").accepting);
    let mut broker = LinuxInputBroker::default();
    broker.shared.ready.store(true, Ordering::Release);
    broker.stop();
    broker.stop();
    assert!(!broker.shared.ready.load(Ordering::Acquire));
}

#[test]
fn dispatch_accepts_keyboard_shortcuts_and_ignores_invalid_lines_in_sequence() {
    use crate::input::{InputKey, InputModifier, NativeInputEvent};
    use std::sync::{Arc, Mutex};
    let shared = BrokerShared::default();
    let queue = Arc::new(Mutex::new(InputEventQueue::default()));
    shared
        .subscribers
        .lock()
        .expect("subscribers")
        .push(Arc::downgrade(&queue));
    for line in [
        "",
        "not-json",
        r#"{"event":"shortcut","monotonicNs":8,"pressed":true,"modifiers":["control"],"key":"escape"}"#,
        r#"{"event":"mouse-motion","monotonicNs":9,"deltaX":3,"deltaY":-2}"#,
        r#"{"event":"shortcut","monotonicNs":10,"pressed":false,"modifiers":["control"],"key":"escape"}"#,
    ] {
        dispatch_input_line(&shared, line);
    }
    let events: Vec<_> = queue
        .lock()
        .expect("queue")
        .events
        .iter()
        .cloned()
        .collect();
    assert_eq!(events.len(), 3);
    assert_eq!(
        events[0],
        NativeInputEvent::Shortcut {
            monotonic_ns: 8,
            pressed: true,
            modifiers: vec![InputModifier::Control],
            key: InputKey::Escape
        }
    );
    assert_eq!(
        events[1],
        NativeInputEvent::MouseMotion {
            monotonic_ns: 9,
            delta_x: 3,
            delta_y: -2
        }
    );
    assert_eq!(
        events[2],
        NativeInputEvent::Shortcut {
            monotonic_ns: 10,
            pressed: false,
            modifiers: vec![InputModifier::Control],
            key: InputKey::Escape
        }
    );
}

#[test]
fn local_monitor_drains_events_once_and_rejects_events_after_stop() {
    use crate::input::NativeInputEvent;
    use std::sync::{Arc, Mutex};
    let queue = Arc::new(Mutex::new(InputEventQueue::default()));
    let mut monitor = LinuxInputMonitor {
        queue: queue.clone(),
    };
    queue
        .lock()
        .expect("queue lock")
        .push(NativeInputEvent::MouseButton {
            monotonic_ns: 1,
            button: 1,
            pressed: true,
        });
    assert_eq!(monitor.drain().len(), 1);
    assert!(monitor.drain().is_empty());
    monitor.stop();
    queue
        .lock()
        .expect("queue lock")
        .push(NativeInputEvent::MouseButton {
            monotonic_ns: 2,
            button: 1,
            pressed: false,
        });
    assert!(monitor.drain().is_empty());
}

#[test]
fn local_broker_status_reflects_independent_mouse_and_keyboard_counts() {
    use crate::input::InputAccessState;
    use std::sync::atomic::Ordering;
    let broker = LinuxInputBroker::default();
    broker.shared.mouse_devices.store(0, Ordering::Release);
    broker.shared.keyboard_devices.store(2, Ordering::Release);
    let status = linux_input_access_status_from(&broker);
    assert_eq!(status.state, InputAccessState::Available);
    assert_eq!(status.mouse_devices, Some(0));
    assert_eq!(status.keyboard_devices, Some(2));
    assert!(!status.clicks);
    assert!(status.shortcuts);
}

#[test]
fn stopping_local_broker_clears_readiness_failure_and_subscribers() {
    use std::sync::{Arc, Mutex, atomic::Ordering};
    let mut broker = LinuxInputBroker::default();
    broker.shared.ready.store(true, Ordering::Release);
    broker.last_failure = Some(crate::input::InputAccessStatus::failed(
        &crate::CaptureError::Backend("old".into()),
    ));
    let queue = Arc::new(Mutex::new(InputEventQueue::default()));
    broker
        .shared
        .subscribers
        .lock()
        .expect("subscriber lock")
        .push(Arc::downgrade(&queue));
    broker.stop();
    assert!(!broker.shared.ready.load(Ordering::Acquire));
    assert!(broker.last_failure.is_none());
    assert!(
        broker
            .shared
            .subscribers
            .lock()
            .expect("subscriber lock")
            .is_empty()
    );
}

fn helper(script: &str) -> (Child, BufReader<ChildStdout>, LinuxInputBroker) {
    let mut command = Command::new("/bin/sh");
    command
        .arg("-c")
        .arg(script)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    owned_child::configure(&mut command);
    let mut child = command.spawn().expect("spawn local helper fixture");
    owned_child::register(&child);
    let diagnostics = HelperDiagnostics::start(child.stderr.take().expect("piped stderr"))
        .expect("start stderr diagnostics");
    let stdout = BufReader::new(child.stdout.take().expect("piped stdout"));
    let broker = LinuxInputBroker {
        diagnostics: Some(diagnostics),
        ..LinuxInputBroker::default()
    };
    (child, stdout, broker)
}

#[test]
fn closed_stdout_terminates_a_still_running_helper_and_keeps_stderr() {
    let (mut child, mut stdout, mut broker) =
        helper("printf 'helper stderr detail\\n' >&2; exec 1>&-; exec sleep 5");
    let mut line = String::new();
    assert_eq!(stdout.read_line(&mut line).expect("read stdout EOF"), 0);

    let started = Instant::now();
    let error = failed_startup(&mut broker, &mut child, "");

    assert!(started.elapsed() < Duration::from_secs(2));
    assert!(
        error.to_string().contains("helper stderr detail"),
        "{error}"
    );
    assert!(broker.diagnostics.is_none());
}

#[test]
fn already_exited_126_remains_a_cancellation() {
    let (mut child, mut stdout, mut broker) = helper("exit 126");
    assert_eq!(
        child.wait().expect("wait for canceled helper").code(),
        Some(126)
    );
    let mut line = String::new();
    assert_eq!(stdout.read_line(&mut line).expect("read stdout EOF"), 0);

    let error = failed_startup(&mut broker, &mut child, "");

    assert!(matches!(error, crate::CaptureError::Cancelled));
    assert!(broker.diagnostics.is_none());
}

#[test]
fn malformed_readiness_error_includes_context_and_drained_stderr() {
    let (mut child, mut stdout, mut broker) =
        helper("printf 'helper stderr detail\\n' >&2; printf 'not-json\\n'; exec sleep 30");
    let mut line = String::new();
    assert!(stdout.read_line(&mut line).expect("read readiness line") > 0);

    let error = failed_startup(
        &mut broker,
        &mut child,
        "Invalid input helper readiness JSON: expected a JSON value.",
    );

    let message = error.to_string();
    assert!(message.contains("Invalid input helper readiness JSON"));
    assert!(message.contains("helper stderr detail"));
    assert!(broker.diagnostics.is_none());
}
