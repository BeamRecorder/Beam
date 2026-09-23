#[test]
fn shared_screen_gate_closes_during_pause() {
    let gate = beam_screen::gate::StartGate::new();
    gate.release(10).unwrap();
    assert_eq!(gate.session_ns(20), Some(10));
    gate.pause(30).unwrap();
    assert_eq!(gate.session_ns(40), None);
    gate.resume(60).unwrap();
    assert_eq!(gate.session_ns(70), Some(30));
}
