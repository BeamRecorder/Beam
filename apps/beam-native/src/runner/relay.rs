//! Routes independent QuickJS trees to their native windows.

use std::sync::mpsc::{self, Receiver, Sender};

use argui_platform::WindowKey;
use argui_runtime::{NativeHostBatch, NativeHostControl, WireOperation};

#[cfg(any(debug_assertions, feature = "dev-metrics"))]
use crate::telemetry::mark_commit_for_presentation;

/// A decoded batch with an optional synchronous response for reload swaps.
pub(crate) struct RelayBatch {
    pub(crate) operations: Vec<WireOperation>,
    pub(crate) controls: Vec<NativeHostControl>,
    pub(crate) acknowledgement: Option<Sender<Result<(), String>>>,
}

/// Starts the main scene's transaction relay until its actor channel closes.
pub(super) fn spawn_main_relay(
    wire: Receiver<RelayBatch>,
    batches: Sender<NativeHostBatch>,
    errors: Sender<String>,
) {
    std::thread::spawn(move || relay_batches(WindowKey::main(), wire, batches, errors));
}

/// Sends each decoded JS transaction to its owning native window.
pub(super) fn relay_batches(
    window: WindowKey,
    wire: Receiver<RelayBatch>,
    batches: Sender<NativeHostBatch>,
    errors: Sender<String>,
) {
    let mut batch_sequence = 0_u64;
    for message in wire {
        batch_sequence += 1;
        let operation_count = message.operations.len();
        let (reply, completion) = mpsc::channel();
        if batches
            .send(NativeHostBatch {
                window: window.clone(),
                operations: message.operations,
                controls: message.controls,
                reply,
            })
            .is_err()
        {
            break;
        }
        match completion.recv() {
            Ok(Ok(_)) => {
                if let Some(ack) = message.acknowledgement {
                    let _ = ack.send(Ok(()));
                }
                if batch_sequence > 1 && operation_count >= 50 {
                    #[cfg(any(debug_assertions, feature = "dev-metrics"))]
                    mark_commit_for_presentation();
                }
            }
            Ok(Err(error)) => {
                if let Some(ack) = message.acknowledgement {
                    let _ = ack.send(Err(error));
                    continue;
                }
                let _ = errors.send(error);
                break;
            }
            Err(_) => break,
        }
    }
}
