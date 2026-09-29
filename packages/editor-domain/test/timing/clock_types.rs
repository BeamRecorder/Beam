use beam_editor_domain::{
    collections::PersistentItem,
    timing::{ClipClock, Rate, Time, TimeSpace, map_time, sequence_time, unmap_time},
};

#[test]
fn lightweight_headers_preserve_the_clip_clock_without_loading_parameters() {
    let mut clip = (*crate::fixtures::clip(&crate::fixtures::project(), 0)).clone();
    clip.start_ms = 3200;
    clip.source_in_ms = 1700;
    clip.animation_offset_ms = -200;
    clip.rate = Rate {
        numerator: 3,
        denominator: 2,
    };
    let header = clip.header();
    assert_eq!(header.start_ms(), clip.start_ms());
    assert_eq!(header.source_in_ms(), clip.source_in_ms());
    assert_eq!(header.animation_offset_ms(), clip.animation_offset_ms());
    assert_eq!(header.rate(), clip.rate());
    for time in [
        Time::milliseconds(3000),
        Time {
            ticks: 12_001,
            timescale: 3000,
        },
    ] {
        for space in [TimeSpace::Sequence, TimeSpace::ClipLocal, TimeSpace::Source] {
            let mapped = map_time(&clip, time, space).unwrap();
            assert_eq!(map_time(&header, time, space).unwrap(), mapped);
            assert_eq!(
                unmap_time(&header, mapped, space).unwrap(),
                unmap_time(&clip, mapped, space).unwrap()
            );
        }
        assert_eq!(
            sequence_time(&header, time).unwrap(),
            sequence_time(&clip, time).unwrap()
        );
    }
}

#[test]
fn header_mapping_returns_the_same_invalid_clock_and_budget_errors() {
    let clip = crate::fixtures::clip(&crate::fixtures::project(), 0);
    let mut header = clip.header();
    header.rate.numerator = 0;
    assert!(map_time(&header, Time::ZERO, TimeSpace::Source).is_err());
    assert!(sequence_time(&header, Time::ZERO).is_err());
    header.rate.numerator = 1;
    header.animation_offset_ms = i64::MIN;
    assert!(unmap_time(&header, Time::ZERO, TimeSpace::ClipLocal).is_err());
    header.animation_offset_ms = 0;
    header.start_ms = u64::MAX;
    assert!(map_time(&header, Time::ZERO, TimeSpace::ClipLocal).is_err());
    header.start_ms = 0;
    assert!(
        map_time(
            &header,
            Time {
                ticks: 1,
                timescale: 0
            },
            TimeSpace::Sequence
        )
        .is_err()
    );
}

#[test]
fn borrowed_and_shared_clocks_retain_exact_source_mapping() {
    let mut project = crate::fixtures::project();
    let clip = crate::fixtures::clip(&project, 0);
    let reference = &clip;
    let time = Time {
        ticks: 101,
        timescale: 30,
    };
    assert_eq!(
        map_time(&reference, time, TimeSpace::Source).unwrap(),
        map_time(clip.as_ref(), time, TimeSpace::Source).unwrap()
    );
    let mut header = clip.header();
    let borrowed = &mut header;
    assert_eq!(
        sequence_time(&borrowed, time).unwrap(),
        sequence_time(&clip, time).unwrap()
    );
    let edited = crate::fixtures::clip_mut(&mut project, 0);
    assert_eq!(
        sequence_time(&edited, time).unwrap(),
        sequence_time(&clip, time).unwrap()
    );
}
