//! Ownership carried from lazy-window startup through scene disposal.

use super::{RelayBatch, auxiliary::WindowGate};
use crate::services::{ServiceRegistry, ServiceResponse};
use std::sync::{Arc, mpsc::Sender};

pub(super) struct AuxiliaryStartup {
    pub source: String,
    pub contract_json: &'static str,
    pub window: &'static str,
    pub entry: &'static str,
    pub generation: u32,
    pub services: Arc<ServiceRegistry>,
    pub wire_sender: Sender<RelayBatch>,
    pub services_sender: Sender<ServiceResponse>,
    pub gate: Arc<WindowGate>,
}
