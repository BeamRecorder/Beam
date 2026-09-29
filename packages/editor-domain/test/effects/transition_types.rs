use beam_editor_domain::{
    Document,
    animation::{Binding, Interpolation, Keyframe, Value},
    collections::{LazyPage, PersistentCollection, PersistentItem},
    effects::{Transition, transitions},
    timing::{ClipClock, Rate, Time, TimeSpace, map_time, unmap_time},
};
use std::sync::{
    Arc,
    atomic::{AtomicUsize, Ordering},
};
use uuid::Uuid;

#[test]
fn odd_transition_handles_map_local_curves_without_loading_either_source_payload() {
    let mut project = crate::fixtures::project();
    let mut incoming = (*crate::fixtures::clip(&project, 0)).clone();
    incoming.id = Uuid::new_v4();
    incoming.start_ms = 3001;
    let transition = Transition {
        from_clip: crate::fixtures::clip(&project, 0).id,
        to_clip: incoming.id,
        duration_ms: 1001,
        instance: project
            .definitions
            .iter()
            .find(|definition| definition.id == "beam.crossfade")
            .unwrap()
            .instantiate(),
    };
    let loads = Arc::new(AtomicUsize::new(0));
    let counted = loads.clone();
    project.clips = PersistentCollection::from_lazy(
        vec![LazyPage {
            hash: "a".repeat(64),
            headers: vec![incoming.header()],
        }],
        Arc::new(move |_| {
            counted.fetch_add(1, Ordering::SeqCst);
            Err(beam_editor_domain::EditorError::Invalid(
                "payload intentionally unavailable".into(),
            ))
        }),
    )
    .unwrap();
    let document = Document::new(project);
    let clock = transitions::clock(&document.project.clips, &transition).unwrap();
    assert_eq!(clock.start_ms(), 2500);
    assert_eq!(clock.source_in_ms(), 0);
    assert_eq!(clock.animation_offset_ms(), 0);
    assert_eq!(clock.rate(), Rate::default());
    let sequence = Time::milliseconds(2750);
    let local = map_time(&clock, sequence, TimeSpace::ClipLocal).unwrap();
    assert_eq!(
        local.compare(Time::milliseconds(250)),
        std::cmp::Ordering::Equal
    );
    assert_eq!(
        unmap_time(&clock, local, TimeSpace::ClipLocal)
            .unwrap()
            .compare(sequence),
        std::cmp::Ordering::Equal
    );
    let curve = Binding::Curve {
        space: TimeSpace::ClipLocal,
        keys: [(0, 0.), (1000, 1.)]
            .into_iter()
            .map(|(time, value)| Keyframe {
                id: Uuid::new_v4(),
                time: Time::milliseconds(time),
                value: Value::Number(value),
                interpolation: Interpolation::Linear,
            })
            .collect(),
    };
    assert_eq!(
        curve.at_sequence(&clock, sequence).unwrap(),
        Value::Number(0.25)
    );
    assert_eq!(loads.load(Ordering::SeqCst), 0);
}

#[test]
fn transition_clock_rejects_missing_inputs_invalid_duration_and_out_of_budget_handles() {
    let mut project = crate::fixtures::project();
    let clip_id = crate::fixtures::clip(&project, 0).id;
    let mut transition = Transition {
        from_clip: clip_id,
        to_clip: Uuid::new_v4(),
        duration_ms: 1000,
        instance: project
            .definitions
            .iter()
            .find(|definition| definition.id == "beam.crossfade")
            .unwrap()
            .instantiate(),
    };
    assert!(transitions::clock(&project.clips, &transition).is_err());
    transition.to_clip = clip_id;
    assert!(transitions::clock(&project.clips, &transition).is_err());
    crate::fixtures::clip_mut(&mut project, 0).start_ms = 2000;
    transition.duration_ms = 1;
    assert!(transitions::clock(&project.clips, &transition).is_err());
    transition.duration_ms = 1000;
    crate::fixtures::clip_mut(&mut project, 0).start_ms = u64::MAX;
    assert!(transitions::clock(&project.clips, &transition).is_err());
    crate::fixtures::clip_mut(&mut project, 0).start_ms =
        beam_editor_domain::project::types::MAX_DURATION_MS;
    assert!(transitions::clock(&project.clips, &transition).is_err());
}
