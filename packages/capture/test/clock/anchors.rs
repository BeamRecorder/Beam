#![allow(clippy::expect_used)]

use capture::{
    clock::AnchorSeries,
    model::{TimingAnchor, TrackId},
};

#[test]
fn anchors_are_filtered_by_track_without_changing_insertion_order() {
    let first = TrackId::new();
    let second = TrackId::new();
    let mut series = AnchorSeries::default();
    for (track_id, session_ns, native_position) in
        [(first, 1, 100), (second, 2, 200), (first, 3, 300)]
    {
        series
            .push(TimingAnchor {
                track_id,
                session_ns,
                native_position,
                native_rate: 48_000,
            })
            .expect("anchor");
    }
    assert_eq!(
        series
            .for_track(first)
            .iter()
            .map(|anchor| anchor.native_position)
            .collect::<Vec<_>>(),
        [100, 300]
    );
    assert_eq!(series.for_track(second).len(), 1);
    assert!(series.for_track(TrackId::new()).is_empty());
    assert!(
        series
            .push(TimingAnchor {
                track_id: first,
                session_ns: 4,
                native_position: 400,
                native_rate: 0,
            })
            .is_err()
    );
}
