use beam_editor_engine::video::visuals::{reuse::pool, types::Waveform};
fn slice(start: u64, step: u64, peaks: &[f32], ready: &[bool]) -> Waveform {
    Waveform {
        start_ms: start,
        duration_ms: step * peaks.len() as u64,
        step_ms: step,
        points: peaks.iter().map(|peak| [*peak; 5]).collect(),
        ready: ready.to_vec(),
    }
}
#[test]
fn equal_and_finer_bins_pool_extrema_from_multiple_contiguous_slices() {
    let mut target = slice(0, 20, &[0., 0.], &[false, false]);
    pool(
        &mut target,
        vec![
            slice(0, 10, &[0.1, 0.9], &[true, true]),
            slice(20, 10, &[0.8, 0.2], &[true, true]),
        ]
        .into_iter(),
    );
    assert_eq!(target.points, vec![[0.9; 5], [0.8; 5]]);
    assert_eq!(target.ready, vec![true, true]);
}
#[test]
fn pending_gaps_coarser_data_and_outside_bin_extrema_do_not_fabricate_coverage() {
    for source in [
        slice(0, 10, &[0.8, 0.9], &[true, false]),
        slice(0, 40, &[0.9], &[true]),
        slice(5, 10, &[0.9, 0.8], &[true, true]),
    ] {
        let mut target = slice(0, 20, &[0.], &[false]);
        pool(&mut target, [source].into_iter());
        assert_eq!(target.ready, vec![false]);
    }
}
#[test]
fn partial_last_bins_and_empty_caches_respect_source_boundaries() {
    let mut source = slice(0, 10, &[0.2, 0.7], &[true, true]);
    source.duration_ms = 15;
    let mut target = slice(0, 20, &[0.], &[false]);
    target.duration_ms = 15;
    pool(&mut target, [source].into_iter());
    assert_eq!(target.points, vec![[0.7; 5]]);
    let mut target = slice(100, 10, &[0.], &[false]);
    pool(&mut target, [].into_iter());
    assert_eq!(target.ready, vec![false]);
}
