//! Native input routing to independent window actors.

use crate::services::ServiceRegistry;
use argui_runtime::NativeHostDelivery;
use std::sync::{
    Arc,
    mpsc::{Receiver, Sender},
};

/// Routes input until the native channel closes, waking its mounted generation.
pub(super) fn route_deliveries(
    native: Receiver<NativeHostDelivery>,
    main: Sender<NativeHostDelivery>,
    auxiliary: Vec<(u32, Sender<NativeHostDelivery>)>,
    services: Arc<ServiceRegistry>,
) {
    std::thread::spawn(move || {
        for delivery in native {
            let generation = delivery.callback.node.generation();
            if let Some((_, sender)) = auxiliary
                .iter()
                // Retained auxiliary actors own one exact generation. Ranges
                // overlapped for the two region scenes and swallowed clicks.
                .find(|(base, _)| generation == *base)
            {
                let _ = sender.send(delivery);
            } else {
                let _ = main.send(delivery);
            }
            services.wake_actor(generation);
        }
    });
}
