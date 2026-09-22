#![cfg(test)]
#![allow(clippy::expect_used, clippy::panic)]

use super::*;
use std::{
    io::Cursor,
    sync::{Arc, Mutex, atomic::Ordering},
};

fn shared_with_queue() -> (BrokerShared, Arc<Mutex<InputEventQueue>>) {
    let shared = BrokerShared::default();
    shared.ready.store(true, Ordering::Release);
    let queue = Arc::new(Mutex::new(InputEventQueue::default()));
    shared
        .subscribers
        .lock()
        .expect("subscribers")
        .push(Arc::downgrade(&queue));
    (shared, queue)
}

#[test]
fn reader_delivers_valid_mouse_and_keyboard_lines_in_order_then_clears_readiness() {
    use crate::input::{InputKey, InputModifier, NativeInputEvent};
    let (shared, queue) = shared_with_queue();
    let lines = concat!(
        "{\"event\":\"mouse-button\",\"monotonicNs\":1,\"button\":1,\"pressed\":true}\n",
        "{\"event\":\"shortcut\",\"monotonicNs\":2,\"pressed\":true,\"modifiers\":[\"control\"],\"key\":\"escape\"}\n",
        "{\"event\":\"mouse-motion\",\"monotonicNs\":3,\"deltaX\":4,\"deltaY\":-2}\n",
    );
    read_input_lines(Cursor::new(lines), &shared);
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
        NativeInputEvent::MouseButton {
            monotonic_ns: 1,
            button: 1,
            pressed: true
        }
    );
    assert_eq!(
        events[1],
        NativeInputEvent::Shortcut {
            monotonic_ns: 2,
            pressed: true,
            modifiers: vec![InputModifier::Control],
            key: InputKey::Escape
        }
    );
    assert_eq!(
        events[2],
        NativeInputEvent::MouseMotion {
            monotonic_ns: 3,
            delta_x: 4,
            delta_y: -2
        }
    );
    assert!(!shared.ready.load(Ordering::Acquire));
    assert!(shared.subscribers.lock().expect("subscribers").is_empty());
}

#[test]
fn reader_skips_empty_and_malformed_json_but_continues_to_later_valid_events() {
    let (shared, queue) = shared_with_queue();
    let lines = "\nnot-json\n{}\n{\"event\":\"mouse-button\",\"monotonicNs\":4,\"button\":1,\"pressed\":false}\n";
    read_input_lines(Cursor::new(lines), &shared);
    let queue = queue.lock().expect("queue");
    assert_eq!(queue.events.len(), 1);
    assert_eq!(queue.events[0].monotonic_ns(), 4);
}

#[test]
fn invalid_utf8_stops_reader_before_subsequent_lines_and_clears_subscribers() {
    let (shared, queue) = shared_with_queue();
    let mut bytes =
        b"{\"event\":\"mouse-button\",\"monotonicNs\":5,\"button\":1,\"pressed\":true}\n".to_vec();
    bytes.extend_from_slice(b"\xff\n");
    bytes.extend_from_slice(
        b"{\"event\":\"mouse-button\",\"monotonicNs\":6,\"button\":1,\"pressed\":true}\n",
    );
    read_input_lines(Cursor::new(bytes), &shared);
    let queue = queue.lock().expect("queue");
    assert_eq!(queue.events.len(), 1);
    assert_eq!(queue.events[0].monotonic_ns(), 5);
    assert!(!shared.ready.load(Ordering::Acquire));
    assert!(shared.subscribers.lock().expect("subscribers").is_empty());
}

#[test]
fn immediate_eof_clears_readiness_and_subscribers_without_touching_existing_queue() {
    use crate::input::NativeInputEvent;
    let (shared, queue) = shared_with_queue();
    queue
        .lock()
        .expect("queue")
        .events
        .push_back(NativeInputEvent::MouseButton {
            monotonic_ns: 7,
            button: 1,
            pressed: true,
        });
    read_input_lines(Cursor::new(Vec::<u8>::new()), &shared);
    assert!(!shared.ready.load(Ordering::Acquire));
    assert!(shared.subscribers.lock().expect("subscribers").is_empty());
    assert_eq!(queue.lock().expect("queue").events.len(), 1);
}

#[test]
fn reader_preserves_queue_capacity_and_coalesces_motion_under_pressure() {
    use crate::input::NativeInputEvent;
    let (shared, queue) = shared_with_queue();
    {
        let mut queue = queue.lock().expect("queue");
        queue
            .events
            .extend((0..INPUT_QUEUE_CAPACITY as u64).map(|monotonic_ns| {
                NativeInputEvent::MouseMotion {
                    monotonic_ns,
                    delta_x: 1,
                    delta_y: -1,
                }
            }));
    }
    read_input_lines(
        Cursor::new(
            b"{\"event\":\"mouse-motion\",\"monotonicNs\":9999,\"deltaX\":4,\"deltaY\":-3}\n",
        ),
        &shared,
    );
    let queue = queue.lock().expect("queue");
    assert_eq!(queue.events.len(), INPUT_QUEUE_CAPACITY);
    assert!(matches!(
        queue.events.back(),
        Some(NativeInputEvent::MouseMotion {
            monotonic_ns: 9999,
            delta_x: 5,
            delta_y: -4
        })
    ));
}

#[test]
fn reader_delivers_to_surviving_subscribers_when_another_weak_pointer_has_expired() {
    let (shared, first) = shared_with_queue();
    let second = Arc::new(Mutex::new(InputEventQueue::default()));
    let expired = Arc::new(Mutex::new(InputEventQueue::default()));
    shared
        .subscribers
        .lock()
        .expect("subscribers")
        .extend([Arc::downgrade(&expired), Arc::downgrade(&second)]);
    drop(expired);
    read_input_lines(
        Cursor::new(
            b"{\"event\":\"mouse-button\",\"monotonicNs\":8,\"button\":1,\"pressed\":true}\n",
        ),
        &shared,
    );
    assert_eq!(first.lock().expect("first").events.len(), 1);
    assert_eq!(second.lock().expect("second").events.len(), 1);
}

#[test]
fn poisoned_subscriber_lock_does_not_prevent_reader_shutdown() {
    let (shared, queue) = shared_with_queue();
    let shared = Arc::new(shared);
    let other = shared.clone();
    assert!(
        std::thread::spawn(move || {
            let _guard = other.subscribers.lock().expect("subscribers");
            panic!("poison subscriber registry");
        })
        .join()
        .is_err()
    );
    read_input_lines(
        Cursor::new(
            b"{\"event\":\"mouse-button\",\"monotonicNs\":9,\"button\":1,\"pressed\":true}\n",
        ),
        &shared,
    );
    assert!(!shared.ready.load(Ordering::Acquire));
    assert!(queue.lock().expect("queue").events.is_empty());
}

#[test]
fn stopped_queue_drops_new_lines_without_affecting_live_subscriber() {
    let (shared, stopped) = shared_with_queue();
    stopped.lock().expect("queue").accepting = false;
    let live = Arc::new(Mutex::new(InputEventQueue::default()));
    shared
        .subscribers
        .lock()
        .expect("subscribers")
        .push(Arc::downgrade(&live));
    read_input_lines(
        Cursor::new(
            b"{\"event\":\"mouse-button\",\"monotonicNs\":10,\"button\":1,\"pressed\":true}\n",
        ),
        &shared,
    );
    assert!(stopped.lock().expect("stopped").events.is_empty());
    assert_eq!(live.lock().expect("live").events.len(), 1);
}

#[test]
fn poisoned_queue_is_skipped_without_stopping_other_subscribers() {
    let (shared, poisoned) = shared_with_queue();
    let live = Arc::new(Mutex::new(InputEventQueue::default()));
    shared
        .subscribers
        .lock()
        .expect("subscribers")
        .push(Arc::downgrade(&live));
    let other = poisoned.clone();
    assert!(
        std::thread::spawn(move || {
            let _guard = other.lock().expect("queue");
            panic!("poison queue");
        })
        .join()
        .is_err()
    );
    read_input_lines(
        Cursor::new(
            b"{\"event\":\"mouse-button\",\"monotonicNs\":11,\"button\":1,\"pressed\":true}\n",
        ),
        &shared,
    );
    assert_eq!(live.lock().expect("live").events.len(), 1);
    assert!(!shared.ready.load(Ordering::Acquire));
}

#[test]
fn reader_io_error_terminates_and_clears_ready_state() {
    use std::io::{self, BufRead, Read};
    struct FailingReader;
    impl Read for FailingReader {
        fn read(&mut self, _: &mut [u8]) -> io::Result<usize> {
            Err(io::Error::other("fixture read error"))
        }
    }
    impl BufRead for FailingReader {
        fn fill_buf(&mut self) -> io::Result<&[u8]> {
            Err(io::Error::other("fixture read error"))
        }
        fn consume(&mut self, _: usize) {}
    }
    let (shared, queue) = shared_with_queue();
    read_input_lines(FailingReader, &shared);
    assert!(!shared.ready.load(Ordering::Acquire));
    assert!(shared.subscribers.lock().expect("subscribers").is_empty());
    assert!(queue.lock().expect("queue").events.is_empty());
}

#[test]
fn startup_exit_127_keeps_error_context_and_stderr_instead_of_cancellation() {
    let (mut child, mut stdout, mut broker) =
        helper("printf 'exec failed detail\\n' >&2; exit 127");
    assert_eq!(child.wait().expect("wait helper").code(), Some(127));
    let mut line = String::new();
    assert_eq!(stdout.read_line(&mut line).expect("read EOF"), 0);
    let error = failed_startup(&mut broker, &mut child, "readiness missing");
    assert_eq!(error.code(), "capture-error");
    assert!(error.to_string().contains("readiness missing"));
    assert!(error.to_string().contains("exec failed detail"));
}
