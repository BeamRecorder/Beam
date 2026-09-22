#![cfg(test)]
#![allow(clippy::expect_used)]

use super::{audio_format_parameter, parse_audio_format_event, peak_f32le};

#[test]
fn absent_format_event_keeps_previous_negotiation() {
    assert!(parse_audio_format_event(None).expect("no event").is_none());
    assert!(
        !audio_format_parameter()
            .expect("format parameter")
            .is_empty()
    );
}

#[test]
fn peak_ignores_nonfinite_samples_and_incomplete_tail() {
    let mut samples = Vec::new();
    for value in [f32::NAN, f32::INFINITY, -0.75, 0.5] {
        samples.extend_from_slice(&value.to_le_bytes());
    }
    samples.extend_from_slice(&[0xff, 0xff]);
    assert_eq!(peak_f32le(&samples), 0.75);
    assert_eq!(peak_f32le(&2.0_f32.to_le_bytes()), 1.0);
}
