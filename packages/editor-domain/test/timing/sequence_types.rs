use beam_editor_domain::timing::{SequenceClock, Time, TimeSpace, map_time, unmap_time};
use std::sync::Arc;

#[test]
fn absolute_clock_keeps_fractional_sequence_time_and_rejects_other_origins_through_borrows() {
    let clock = Arc::new(SequenceClock);
    let time = Time {
        ticks: 12_345,
        timescale: 3000,
    };
    assert_eq!(map_time(&clock, time, TimeSpace::Sequence).unwrap(), time);
    assert_eq!(unmap_time(&clock, time, TimeSpace::Sequence).unwrap(), time);
    for space in [TimeSpace::ClipLocal, TimeSpace::Source] {
        assert!(map_time(&clock, time, space).is_err());
        assert!(unmap_time(&clock, time, space).is_err());
    }
    assert!(beam_editor_domain::timing::sequence_time(&clock, time).is_err());
    assert!(
        map_time(
            &clock,
            Time {
                ticks: 1,
                timescale: 0
            },
            TimeSpace::Sequence
        )
        .is_err()
    );
}
