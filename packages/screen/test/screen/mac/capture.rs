#![cfg(test)]
#[test]
fn native_callback_waits_for_acquisition_gate_and_errors_name_the_backend() {
    let gate = crate::gate::StartGate::new();
    assert!(!super::request_gate_released(&gate));
    assert!(gate.release(0).is_ok());
    assert!(super::request_gate_released(&gate));
    assert!(
        super::backend_error("lost")
            .to_string()
            .contains("ScreenCaptureKit: lost")
    );
}
