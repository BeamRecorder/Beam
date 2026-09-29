use crate::fixtures::{decision, decision_mut};
mod clock_types;
mod sequence_types;
mod types;

#[test]
fn source_sequence_mapping_inverts_exact_rational_rates_and_handle_times() {
    let mut p = crate::fixtures::project();
    let mut clip = decision_mut(&mut p.clips, 0);
    clip.start_ms = 3000;
    clip.source_in_ms = 1000;
    clip.rate = beam_editor_domain::timing::Rate {
        numerator: 3,
        denominator: 2,
    };
    for source in [
        beam_editor_domain::timing::Time::milliseconds(900),
        beam_editor_domain::timing::Time {
            ticks: 12345,
            timescale: 3000,
        },
    ] {
        let sequence = beam_editor_domain::timing::sequence_time(&clip, source).unwrap();
        let restored = beam_editor_domain::timing::map_time(
            &clip,
            sequence,
            beam_editor_domain::timing::TimeSpace::Source,
        )
        .unwrap();
        assert_eq!(restored.compare(source), std::cmp::Ordering::Equal);
    }
}
#[test]
fn inverse_mapping_rejects_invalid_source_time_and_zero_rate() {
    let mut p = crate::fixtures::project();
    assert!(
        beam_editor_domain::timing::sequence_time(
            &decision(&p.clips, 0),
            beam_editor_domain::timing::Time {
                ticks: 1,
                timescale: 0
            }
        )
        .is_err()
    );
    decision_mut(&mut p.clips, 0).rate.numerator = 0;
    assert!(
        beam_editor_domain::timing::sequence_time(
            &decision(&p.clips, 0),
            beam_editor_domain::timing::Time::ZERO
        )
        .is_err()
    );
}
#[test]
fn inverse_local_mapping_retains_animation_offsets_and_sequence_coordinates() {
    let mut p = crate::fixtures::project();
    let mut clip = decision_mut(&mut p.clips, 0);
    clip.start_ms = 2000;
    clip.animation_offset_ms = 500;
    let local = beam_editor_domain::timing::Time::milliseconds(750);
    let sequence = beam_editor_domain::timing::unmap_time(
        &clip,
        local,
        beam_editor_domain::timing::TimeSpace::ClipLocal,
    )
    .unwrap();
    assert_eq!(
        sequence.compare(beam_editor_domain::timing::Time::milliseconds(2250)),
        std::cmp::Ordering::Equal
    );
    assert_eq!(
        beam_editor_domain::timing::unmap_time(
            &clip,
            sequence,
            beam_editor_domain::timing::TimeSpace::Sequence
        )
        .unwrap(),
        sequence
    );
}

#[test]
fn inverse_mapping_rejects_extreme_clip_origins_before_multiplying_rationals() {
    let mut project = crate::fixtures::project();
    let mut clip = decision_mut(&mut project.clips, 0);
    clip.start_ms = u64::MAX;
    clip.rate = beam_editor_domain::timing::Rate {
        numerator: u32::MAX,
        denominator: u32::MAX,
    };
    assert!(
        beam_editor_domain::timing::sequence_time(
            &clip,
            beam_editor_domain::timing::Time {
                ticks: beam_editor_domain::timing::MAX_TICKS,
                timescale: u32::MAX
            }
        )
        .is_err()
    );
    clip.start_ms = 0;
    clip.source_in_ms = u64::MAX;
    assert!(
        beam_editor_domain::timing::sequence_time(&clip, beam_editor_domain::timing::Time::ZERO)
            .is_err()
    );
}

#[test]
fn mapping_rejects_zero_scale_rate_and_out_of_budget_values_in_every_space() {
    use beam_editor_domain::timing::{MAX_TICKS, Time, TimeSpace, map_time, unmap_time};
    let mut project = crate::fixtures::project();
    let mut clip = decision_mut(&mut project.clips, 0);
    for space in [TimeSpace::Sequence, TimeSpace::ClipLocal, TimeSpace::Source] {
        for time in [
            Time {
                ticks: 1,
                timescale: 0,
            },
            Time {
                ticks: i64::MIN,
                timescale: 1,
            },
        ] {
            assert!(map_time(&clip, time, space).is_err());
            assert!(unmap_time(&clip, time, space).is_err());
        }
    }
    clip.rate.numerator = 0;
    assert!(map_time(&clip, Time::ZERO, TimeSpace::Source).is_err());
    clip.rate.numerator = u32::MAX;
    assert!(
        map_time(
            &clip,
            Time {
                ticks: MAX_TICKS,
                timescale: 1
            },
            TimeSpace::Source
        )
        .is_err()
    );
    clip.animation_offset_ms = i64::MIN;
    assert!(map_time(&clip, Time::ZERO, TimeSpace::ClipLocal).is_err());
    assert!(unmap_time(&clip, Time::ZERO, TimeSpace::ClipLocal).is_err());
}

#[test]
fn mapping_rounds_large_rational_denominators_once_and_symmetrically() {
    use beam_editor_domain::timing::{Time, TimeSpace, map_time};
    let mut project = crate::fixtures::project();
    let mut clip = decision_mut(&mut project.clips, 0);
    clip.start_ms = 0;
    clip.source_in_ms = 0;
    clip.rate.numerator = 1;
    clip.rate.denominator = 3;
    for ticks in [1, -1, 6_000_000_001, -6_000_000_001] {
        let time = Time {
            ticks,
            timescale: 2_000_000_000,
        };
        let actual = map_time(&clip, time, TimeSpace::Source).unwrap();
        assert_eq!(actual.timescale, 1_000_000_000);
        let expected = ((ticks as f64 / 6.).round()) as i64;
        assert_eq!(actual.ticks, expected);
    }
}

#[test]
fn mapping_extreme_valid_rates_never_panics_or_wraps_backend_ticks() {
    use beam_editor_domain::timing::{MAX_TICKS, Time, TimeSpace, map_time, sequence_time};
    let mut project = crate::fixtures::project();
    let mut clip = decision_mut(&mut project.clips, 0);
    clip.start_ms = beam_editor_domain::project::types::MAX_DURATION_MS;
    clip.source_in_ms = clip.start_ms;
    clip.rate.numerator = u32::MAX;
    clip.rate.denominator = u32::MAX - 1;
    for ticks in [MAX_TICKS, -MAX_TICKS] {
        for timescale in [1, u32::MAX] {
            let time = Time { ticks, timescale };
            for mapped in [
                map_time(&clip, time, TimeSpace::Source),
                sequence_time(&clip, time),
            ]
            .into_iter()
            .flatten()
            {
                mapped.validate().unwrap();
            }
        }
    }
}
