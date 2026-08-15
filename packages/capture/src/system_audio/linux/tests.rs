use super::format::peak_f32le;

#[test]
fn peak_uses_the_loudest_absolute_finite_sample() {
    let bytes = [0.1_f32, -0.75, f32::NAN, 0.25]
        .into_iter()
        .flat_map(f32::to_le_bytes)
        .collect::<Vec<_>>();

    assert_eq!(peak_f32le(&bytes), 0.75);
}

#[test]
fn peak_clamps_overdriven_audio_and_ignores_partial_samples() {
    let mut bytes = 1.5_f32.to_le_bytes().to_vec();
    bytes.extend_from_slice(&[1, 2, 3]);

    assert_eq!(peak_f32le(&bytes), 1.0);
}

#[test]
fn peak_is_zero_for_silence_or_non_finite_samples() {
    let bytes = [0.0_f32, f32::INFINITY]
        .into_iter()
        .flat_map(f32::to_le_bytes)
        .collect::<Vec<_>>();

    assert_eq!(peak_f32le(&bytes), 0.0);
}
