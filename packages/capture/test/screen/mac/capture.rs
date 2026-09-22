#![cfg(test)]

use super::{MacRecording, dimension};
use crate::{model::SourceId, session::StartGate};
use std::sync::Arc;

#[test]
fn invalid_frame_rate_fails_before_mac_permission_prompt() -> Result<(), Box<dyn std::error::Error>>
{
    let source = SourceId::new("sck:display:1")?;
    let gate = Arc::new(StartGate::new());
    let result = MacRecording::start(
        &source,
        std::path::Path::new("capture.mp4"),
        0,
        false,
        None,
        &[],
        gate,
    );
    assert!(result.is_err());
    assert_eq!(dimension(0.0), 1);
    assert_eq!(dimension(f64::MAX), u32::MAX);
    Ok(())
}
