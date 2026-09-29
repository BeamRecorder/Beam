use beam_editor_domain::{
    Document,
    animation::{Binding, Interpolation, Keyframe, Value},
    commands::projections,
    effects::{Transition, definition},
    timing::{Rate, Time, TimeRange, TimeSpace},
};
use uuid::Uuid;

#[test]
fn regions_map_source_rates_and_local_offsets_and_intersect_half_open_viewports() {
    let mut project = crate::fixtures::project();
    let mut zoom = definition(&project.definitions, "beam.camera.zoom", 1)
        .unwrap()
        .instantiate();
    zoom.range = Some(TimeRange {
        space: TimeSpace::Source,
        start: Time::milliseconds(1300),
        end: Time::milliseconds(2500),
    });
    let mut cursor = definition(&project.definitions, "beam.cursor", 1)
        .unwrap()
        .instantiate();
    cursor.enabled = false;
    cursor.range = Some(TimeRange {
        space: TimeSpace::ClipLocal,
        start: Time::milliseconds(200),
        end: Time::milliseconds(1200),
    });
    let mut clip = crate::fixtures::clip_mut(&mut project, 0);
    clip.start_ms = 2000;
    clip.source_in_ms = 1000;
    clip.duration_ms = 2000;
    clip.rate = Rate {
        numerator: 3,
        denominator: 2,
    };
    clip.animation_offset_ms = 500;
    clip.instances = vec![zoom.clone(), cursor.clone()];
    drop(clip);
    let document = Document::new(project);
    let regions = projections::regions(
        &document,
        document.active_sequence,
        Time::milliseconds(0),
        Time::milliseconds(5000),
    )
    .unwrap();
    assert_eq!(regions.len(), 2);
    assert_eq!(regions[0].id, cursor.id);
    assert!(!regions[0].enabled);
    assert_eq!(regions[0].start, Time::milliseconds(2000));
    assert_eq!(
        regions[0].end.compare(Time::milliseconds(2700)),
        std::cmp::Ordering::Equal
    );
    assert_eq!(regions[1].id, zoom.id);
    assert_eq!(
        regions[1].start.compare(Time::milliseconds(2200)),
        std::cmp::Ordering::Equal
    );
    assert_eq!(
        regions[1].end.compare(Time::milliseconds(3000)),
        std::cmp::Ordering::Equal
    );
    assert!(
        projections::regions(
            &document,
            document.active_sequence,
            Time::milliseconds(3000),
            Time::milliseconds(4000)
        )
        .unwrap()
        .is_empty()
    );
    assert!(
        projections::regions(
            &document,
            document.active_sequence,
            Time::milliseconds(0),
            Time::milliseconds(2000)
        )
        .unwrap()
        .is_empty()
    );
}

#[test]
fn values_evaluate_the_shared_clock_at_the_playhead_for_repeated_effects_and_generator() {
    let mut project = crate::fixtures::project();
    let mut opacity = definition(&project.definitions, "beam.opacity", 1)
        .unwrap()
        .instantiate();
    opacity.parameters.insert(
        "opacity".into(),
        Binding::Curve {
            space: TimeSpace::Source,
            keys: vec![
                Keyframe {
                    id: Uuid::new_v4(),
                    time: Time::milliseconds(1000),
                    value: Value::Number(0.),
                    interpolation: Interpolation::Linear,
                },
                Keyframe {
                    id: Uuid::new_v4(),
                    time: Time::milliseconds(4000),
                    value: Value::Number(1.),
                    interpolation: Interpolation::Linear,
                },
            ],
        },
    );
    let sibling = opacity.duplicate();
    let generator = definition(&project.definitions, "beam.solid", 1)
        .unwrap()
        .instantiate();
    let mut clip = crate::fixtures::clip_mut(&mut project, 0);
    clip.start_ms = 2000;
    clip.source_in_ms = 1000;
    clip.rate = Rate {
        numerator: 3,
        denominator: 2,
    };
    clip.instances = vec![opacity.clone(), sibling.clone()];
    clip.generator = Some(generator.clone());
    let clip_id = clip.id;
    drop(clip);
    let document = Document::new(project);
    for time in [2500, 2250, 2500] {
        let values = projections::parameter_values(
            &document,
            document.active_sequence,
            clip_id,
            Time::milliseconds(time),
        )
        .unwrap();
        let expected = if time == 2250 { 0.125 } else { 0.25 };
        assert_eq!(values[&opacity.id]["opacity"], Value::Number(expected));
        assert_eq!(values[&sibling.id]["opacity"], Value::Number(expected));
        assert_eq!(
            values[&generator.id]["color"],
            Value::Color([1., 0.35, 0.08, 1.])
        );
    }
}

#[test]
fn transition_regions_use_centered_odd_handles_and_queries_reject_invalid_targets() {
    let mut project = crate::fixtures::project();
    crate::fixtures::clip_mut(&mut project, 0).duration_ms = 2001;
    let mut right = (*crate::fixtures::clip(&project, 0)).clone();
    right.id = Uuid::new_v4();
    right.start_ms = 2001;
    right.source_in_ms = 1000;
    let transition = Transition {
        instance: definition(&project.definitions, "beam.crossfade", 1)
            .unwrap()
            .instantiate(),
        from_clip: crate::fixtures::clip(&project, 0).id,
        to_clip: right.id,
        duration_ms: 501,
    };
    project.transitions.push(transition.clone());
    project.clips.try_push(right).unwrap();
    let document = Document::new(project);
    let regions = projections::regions(
        &document,
        document.active_sequence,
        Time::ZERO,
        Time::milliseconds(5000),
    )
    .unwrap();
    assert_eq!(regions.len(), 1);
    assert_eq!(regions[0].id, transition.instance.id);
    assert_eq!(regions[0].start, Time::milliseconds(1750));
    assert_eq!(regions[0].end, Time::milliseconds(2251));
    assert!(
        projections::regions(&document, document.active_sequence, Time::ZERO, Time::ZERO).is_err()
    );
    assert!(
        projections::regions(&document, Uuid::nil(), Time::ZERO, Time::milliseconds(1)).is_err()
    );
    assert!(
        projections::parameter_values(&document, document.active_sequence, Uuid::nil(), Time::ZERO)
            .is_err()
    );
    assert!(
        projections::parameter_values(
            &document,
            Uuid::nil(),
            crate::fixtures::clip(&document.project, 0).id,
            Time::ZERO
        )
        .is_err()
    );
    assert!(
        projections::parameter_values(
            &document,
            document.active_sequence,
            crate::fixtures::clip(&document.project, 0).id,
            Time {
                ticks: 1,
                timescale: 0
            }
        )
        .is_err()
    );
}

fn animated(
    project: &beam_editor_domain::Project,
    space: TimeSpace,
) -> beam_editor_domain::effects::Instance {
    let mut instance = definition(&project.definitions, "beam.opacity", 2)
        .unwrap()
        .instantiate();
    instance.parameters.insert(
        "opacity".into(),
        Binding::Curve {
            space,
            keys: vec![
                Keyframe {
                    id: Uuid::new_v4(),
                    time: Time::ZERO,
                    value: Value::Number(0.),
                    interpolation: Interpolation::Linear,
                },
                Keyframe {
                    id: Uuid::new_v4(),
                    time: Time::milliseconds(3000),
                    value: Value::Number(1.),
                    interpolation: Interpolation::Linear,
                },
            ],
        },
    );
    instance
}

#[test]
fn scoped_values_keep_actual_clip_mapping_and_absolute_track_sequence_clocks() {
    use beam_editor_domain::protocol::ReadTarget;
    let mut project = crate::fixtures::project();
    let track_id = project.tracks.headers().next().unwrap().id;
    let track_fx = animated(&project, TimeSpace::Sequence);
    let sequence_fx = track_fx.duplicate();
    let clip_fx = animated(&project, TimeSpace::Source);
    project
        .tracks
        .try_by_id_mut(track_id)
        .unwrap()
        .unwrap()
        .instances
        .push(track_fx.clone());
    project.sequence_instances.push(sequence_fx.clone());
    let mut clip = crate::fixtures::clip_mut(&mut project, 0);
    clip.start_ms = 1000;
    clip.source_in_ms = 0;
    clip.rate = Rate {
        numerator: 3,
        denominator: 2,
    };
    clip.instances = vec![clip_fx.clone()];
    let clip_id = clip.id;
    drop(clip);
    let document = Document::new(project);
    let sequence_id = document.active_sequence;
    for time_ms in [1500, 750, 1500] {
        let time = Time::milliseconds(time_ms);
        let track = projections::scoped_parameter_values(
            &document,
            ReadTarget::Track {
                sequence_id,
                track_id,
            },
            time,
        )
        .unwrap();
        let sequence = projections::scoped_parameter_values(
            &document,
            ReadTarget::Sequence { sequence_id },
            time,
        )
        .unwrap();
        let clip = projections::scoped_parameter_values(
            &document,
            ReadTarget::Clip {
                sequence_id,
                clip_id,
            },
            time,
        )
        .unwrap();
        assert_eq!(
            track[&track_fx.id]["opacity"],
            Value::Number(time_ms as f64 / 3000.)
        );
        assert_eq!(
            sequence[&sequence_fx.id]["opacity"],
            track[&track_fx.id]["opacity"]
        );
        assert_eq!(
            clip,
            projections::parameter_values(&document, sequence_id, clip_id, time).unwrap()
        );
        if time_ms == 1500 {
            assert_eq!(clip[&clip_fx.id]["opacity"], Value::Number(0.25));
        }
    }
}

#[test]
fn scoped_reads_reject_wrong_spaces_invalid_payloads_and_missing_identities() {
    use beam_editor_domain::protocol::ReadTarget;
    for space in [TimeSpace::Source, TimeSpace::ClipLocal] {
        let mut project = crate::fixtures::project();
        let track_id = project.tracks.headers().next().unwrap().id;
        let fx = animated(&project, space);
        project
            .tracks
            .try_by_id_mut(track_id)
            .unwrap()
            .unwrap()
            .instances
            .push(fx.clone());
        project.sequence_instances.push(fx.duplicate());
        let document = Document::new(project);
        let sequence_id = document.active_sequence;
        for target in [
            ReadTarget::Track {
                sequence_id,
                track_id,
            },
            ReadTarget::Sequence { sequence_id },
        ] {
            assert!(projections::scoped_parameter_values(&document, target, Time::ZERO).is_err());
        }
    }
    let mut project = crate::fixtures::project();
    let mut fx = animated(&project, TimeSpace::Sequence);
    fx.parameters
        .insert("opacity".into(), Binding::constant(Value::Number(2.)));
    project.sequence_instances.push(fx);
    let document = Document::new(project);
    let sequence_id = document.active_sequence;
    for target in [
        ReadTarget::Clip {
            sequence_id,
            clip_id: Uuid::nil(),
        },
        ReadTarget::Track {
            sequence_id,
            track_id: Uuid::nil(),
        },
        ReadTarget::Sequence {
            sequence_id: Uuid::nil(),
        },
        ReadTarget::Sequence { sequence_id },
    ] {
        assert!(projections::scoped_parameter_values(&document, target, Time::ZERO).is_err());
    }
    assert!(
        projections::scoped_parameter_values(
            &document,
            ReadTarget::Sequence { sequence_id },
            Time {
                ticks: 0,
                timescale: 0
            }
        )
        .is_err()
    );
}

#[test]
fn scoped_regions_use_real_targets_clamp_bounds_and_keep_bypass_without_loading_clips() {
    use beam_editor_domain::{
        collections::{LazyPage, PersistentCollection, PersistentItem},
        protocol::ReadTarget,
    };
    use std::sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    };
    let mut project = crate::fixtures::project();
    let track_id = project.tracks.headers().next().unwrap().id;
    project
        .definitions
        .iter_mut()
        .find(|d| d.id == "beam.opacity" && d.version == 2)
        .unwrap()
        .timeline_region = true;
    let whole = definition(&project.definitions, "beam.opacity", 2)
        .unwrap()
        .instantiate();
    let mut ranged = whole.duplicate();
    ranged.enabled = false;
    ranged.range = Some(TimeRange {
        space: TimeSpace::Sequence,
        start: Time::milliseconds(-100),
        end: Time::milliseconds(700),
    });
    project
        .tracks
        .try_by_id_mut(track_id)
        .unwrap()
        .unwrap()
        .instances
        .push(ranged.clone());
    project.sequence_instances.push(whole.clone());
    let header = crate::fixtures::clip(&project, 0).header();
    let duration = header.start_ms + header.duration_ms;
    let count = Arc::new(AtomicUsize::new(0));
    let loads = count.clone();
    project.clips = PersistentCollection::from_lazy(
        vec![LazyPage {
            hash: "a".repeat(64),
            headers: vec![header],
        }],
        Arc::new(move |_| {
            loads.fetch_add(1, Ordering::SeqCst);
            Err(beam_editor_domain::EditorError::Invalid(
                "unavailable FX".into(),
            ))
        }),
    )
    .unwrap();
    let document = Document::new(project);
    let sequence_id = document.active_sequence;
    let regions = projections::regions(
        &document,
        sequence_id,
        Time::ZERO,
        Time::milliseconds(10_000),
    )
    .unwrap();
    let track = regions
        .iter()
        .find(|region| region.id == ranged.id)
        .unwrap();
    assert_eq!(
        track.target,
        ReadTarget::Track {
            sequence_id,
            track_id
        }
    );
    assert!(!track.enabled);
    assert_eq!(track.start, Time::ZERO);
    assert_eq!(track.end, Time::milliseconds(700));
    let sequence = regions.iter().find(|region| region.id == whole.id).unwrap();
    assert_eq!(sequence.target, ReadTarget::Sequence { sequence_id });
    assert_eq!(sequence.end, Time::milliseconds(duration as i64));
    let boundary = projections::regions(
        &document,
        sequence_id,
        Time::milliseconds(700),
        Time::milliseconds(701),
    )
    .unwrap();
    assert!(!boundary.iter().any(|region| region.id == ranged.id));
    assert_eq!(count.load(Ordering::SeqCst), 0);
}

#[test]
fn scoped_regions_reject_local_ranges_and_skip_empty_sequences() {
    let mut project = beam_editor_domain::Project::new("Empty".into());
    let mut fx = definition(&project.definitions, "beam.opacity", 2)
        .unwrap()
        .instantiate();
    fx.range = Some(TimeRange {
        space: TimeSpace::Sequence,
        start: Time::ZERO,
        end: Time::milliseconds(1000),
    });
    project.sequence_instances.push(fx.clone());
    let document = Document::new(project.clone());
    assert!(
        projections::regions(
            &document,
            document.active_sequence,
            Time::ZERO,
            Time::milliseconds(1000)
        )
        .unwrap()
        .is_empty()
    );
    project.sequence_instances[0].range.as_mut().unwrap().space = TimeSpace::ClipLocal;
    let document = Document::new(project);
    assert!(
        projections::regions(
            &document,
            document.active_sequence,
            Time::ZERO,
            Time::milliseconds(1000)
        )
        .is_err()
    );
}
