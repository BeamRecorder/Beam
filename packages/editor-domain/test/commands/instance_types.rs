use beam_editor_domain::{
    Document,
    animation::{Binding, Interpolation, Value},
    commands::{
        self,
        types::{Command, Operation, Reference},
    },
    timing::{Rate, Time, TimeSpace},
};

#[test]
fn keyframe_at_uses_the_same_fractional_source_and_local_clock_as_the_evaluator() {
    let mut project = crate::fixtures::project();
    let instance = project
        .definitions
        .iter()
        .find(|definition| definition.id == "beam.opacity")
        .unwrap()
        .instantiate();
    let instance_id = instance.id;
    let mut clip = crate::fixtures::clip_mut(&mut project, 0);
    clip.start_ms = 2_000;
    clip.source_in_ms = 1_000;
    clip.duration_ms = 2_000;
    clip.animation_offset_ms = 500;
    clip.rate = Rate {
        numerator: 3,
        denominator: 2,
    };
    clip.instances.push(instance);
    let clip_id = clip.id;
    drop(clip);
    let original = Document::new(project);
    for (space, expected) in [
        (TimeSpace::Source, 1750),
        (TimeSpace::ClipLocal, 1000),
        (TimeSpace::Sequence, 2500),
    ] {
        let mut transaction = commands::single(
            &original,
            beam_editor_domain::Edit::Rename {
                name: "unused".into(),
            },
        );
        transaction.commands = vec![Command {
            command_id: "key".into(),
            operation: Operation::KeyframeAt {
                clip: Reference::Id(clip_id),
                instance: Reference::Id(instance_id),
                parameter: "opacity".into(),
                space,
                sequence_time: Time::milliseconds(2500),
                value: Value::Number(0.25),
                interpolation: Interpolation::Linear,
            },
        }];
        let result = commands::prepare(&original, &transaction).unwrap();
        let clip = crate::fixtures::clip(&result.document.project, 0);
        let Binding::Curve { keys, .. } = &clip.instances[0].parameters["opacity"] else {
            unreachable!()
        };
        assert_eq!(
            keys[0].time.compare(Time::milliseconds(expected)),
            std::cmp::Ordering::Equal
        );
        assert_eq!(result.receipt.results[0].created, vec![keys[0].id]);
        assert_eq!(
            clip.instances[0]
                .evaluated(&clip, Time::milliseconds(2500))
                .unwrap()["opacity"],
            Value::Number(0.25)
        );
    }
}
