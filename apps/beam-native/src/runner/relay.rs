//! Routes independent QuickJS trees to their native windows.

use std::sync::mpsc::{self, Receiver, Sender};

use argui_platform::WindowKey;
use argui_runtime::{NativeHostBatch, NativeHostControl, WireOperation};

#[cfg(any(debug_assertions, feature = "dev-metrics"))]
use crate::telemetry::{discard_commit_for_presentation, mark_commit_for_presentation};

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
    #[cfg(any(debug_assertions, feature = "dev-metrics"))]
    let mut batch_sequence = 0_u64;
    for message in wire {
        #[cfg(any(debug_assertions, feature = "dev-metrics"))]
        let entered = std::time::Instant::now();
        #[cfg(any(debug_assertions, feature = "dev-metrics"))]
        {
            batch_sequence += 1;
            if batch_sequence > 1 && message.operations.len() >= 50 {
                mark_commit_for_presentation(&window);
            }
        }
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
            #[cfg(any(debug_assertions, feature = "dev-metrics"))]
            discard_commit_for_presentation(&window);
            break;
        }
        match completion.recv() {
            Ok(Ok(commit)) => {
                #[cfg(any(debug_assertions, feature = "dev-metrics"))]
                if std::env::var_os("BEAM_NATIVE_TRACE_COMMITS").is_some() {
                    eprintln!(
                        "beam-commit window={} queued_commit_to_ack_ms={:.3} update={:?} nodes={}",
                        window.as_str(),
                        entered.elapsed().as_secs_f64() * 1000.0,
                        commit.update,
                        commit.changed_nodes
                    );
                }
                #[cfg(not(any(debug_assertions, feature = "dev-metrics")))]
                let _ = commit;
                if let Some(ack) = message.acknowledgement {
                    let _ = ack.send(Ok(()));
                }
            }
            Ok(Err(error)) => {
                #[cfg(any(debug_assertions, feature = "dev-metrics"))]
                discard_commit_for_presentation(&window);
                if let Some(ack) = message.acknowledgement {
                    let _ = ack.send(Err(error));
                    continue;
                }
                let _ = errors.send(error);
                break;
            }
            Err(_) => {
                #[cfg(any(debug_assertions, feature = "dev-metrics"))]
                discard_commit_for_presentation(&window);
                break;
            }
        }
    }
}
