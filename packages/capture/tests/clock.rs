#![allow(clippy::expect_used)]

use capture::{
    clock::{AnchorSeries, LinearTimestampMapper, TimestampMapper},
    model::{TimingAnchor, TrackId},
};

#[test]
fn timestamps_map_to_session_clock() {
    let mut mapper = LinearTimestampMapper::new(48_000, 10, 48_000).expect("mapper");
    assert_eq!(
        mapper.to_session_ns(96_000).expect("timestamp"),
        1_000_000_010
    );
    assert!(mapper.to_session_ns(47_999).is_err());
}

#[test]
fn anchors_refuse_non_monotonic_values() {
    let id = TrackId::new();
    let mut series = AnchorSeries::default();
    series
        .push(TimingAnchor {
            track_id: id,
            session_ns: 10,
            native_position: 1,
            native_rate: 1,
        })
        .expect("first anchor");
    assert!(
        series
            .push(TimingAnchor {
                track_id: id,
                session_ns: 9,
                native_position: 2,
                native_rate: 1
            })
            .is_err()
    );
}
