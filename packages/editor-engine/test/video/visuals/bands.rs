use beam_editor_engine::video::visuals::bands::Bands;
#[test]
fn silence_produces_no_envelopes_and_empty_output_is_safe() {
    let mut bands = Bands::new(0);
    let mut out = [[0.; 5]; 2];
    for _ in 0..512 {
        bands.add(0., 0, &mut out);
    }
    bands.flush(&mut out);
    assert_eq!(out, [[0.; 5]; 2]);
    bands.add(0.1, 10, &mut []);
    bands.flush(&mut []);
}
#[test]
fn low_and_high_tones_use_distinct_bands_and_leave_peak_channel_to_pcm() {
    let tone = |frequency: f64| {
        let mut bands = Bands::new(16000);
        let mut out = [[0.; 5]; 2];
        for frame in 0..16000 {
            let sample =
                (frame as f64 * frequency * 2. * std::f64::consts::PI / 16000.).sin() * 0.2;
            bands.add(sample, usize::from(frame >= 8000), &mut out);
        }
        bands.flush(&mut out);
        out
    };
    let low = tone(80.);
    let high = tone(6000.);
    assert!(low[1][1] > low[1][4]);
    assert!(high[1][4] > high[1][1]);
    assert_eq!(low[1][0], 0.);
}
#[test]
fn bin_switch_and_partial_rms_flush_preserve_each_bin() {
    let mut bands = Bands::new(16000);
    let mut out = [[0.; 5]; 2];
    for _ in 0..100 {
        bands.add(0.2, 0, &mut out);
    }
    bands.add(0.1, 1, &mut out);
    bands.flush(&mut out);
    assert!(out[0][1] > 0.);
    assert!(out[1][1] > 0.);
    assert!(out.iter().flatten().all(|value| (0. ..=1.).contains(value)));
}

#[test]
fn frequency_envelopes_match_the_existing_browser_blick_analyzer() {
    let mut bands = Bands::new(48000);
    let mut out = [[0.; 5]; 2];
    for frame in 0..48000 {
        let t = frame as f64 / 48000.;
        let sample = [(0.12, 80.), (0.08, 500.), (0.05, 2500.), (0.03, 6000.)]
            .iter()
            .map(|(gain, hz)| gain * (t * 2. * std::f64::consts::PI * hz).sin())
            .sum();
        bands.add(sample, frame / 24000, &mut out);
    }
    bands.flush(&mut out);
    // Frozen output from the repository's WaveformBands at the same rate/input.
    for point in out {
        for (actual, expected) in point[1..]
            .iter()
            .zip([0.7682838, 0.74795824, 0.7131236, 0.7152579])
        {
            assert!((actual - expected).abs() < 1e-6);
        }
    }
}
