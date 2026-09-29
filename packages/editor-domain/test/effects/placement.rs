use crate::fixtures::{decision, decision_mut};
use beam_editor_domain::{
    Canvas,
    animation::{Binding, Value},
    effects::{Processor, catalog, placement},
    timing::Time,
};

#[test]
fn source_fit_framing_keeps_aspect_and_places_edges_outside_canvas() {
    let canvas = Canvas {
        width: 320,
        height: 180,
        ..Canvas::default()
    };
    let frame = placement::frame(1920, 1080, &canvas, 2., 0., 1.).unwrap();
    assert_eq!(
        (frame.width, frame.height, frame.x, frame.y),
        (640, 360, -320, 0)
    );
    let portrait = placement::frame(1080, 1920, &canvas, 1., 0.5, 0.5).unwrap();
    assert_eq!(
        (portrait.width, portrait.height, portrait.x, portrait.y),
        (101, 180, 109, 0)
    );
    let rounded = placement::frame(853, 480, &canvas, 0.53, 0.23, 0.71).unwrap();
    let width = (320_f64).min(180. * 853. / 480.) * 0.53;
    assert_eq!(
        (rounded.width, rounded.height, rounded.x, rounded.y),
        (
            width.round() as i32,
            (width * 480. / 853.).round() as i32,
            (320. * 0.23 - width / 2.).round() as i32,
            (180. * 0.71 - width * 480. / 853. / 2.).round() as i32
        )
    );
}
#[test]
fn framing_rejects_nonfinite_zero_and_unrepresentable_geometry() {
    let canvas = Canvas::default();
    for args in [
        (0, 1080, 1., 0.5, 0.5),
        (1920, 0, 1., 0.5, 0.5),
        (1920, 1080, f64::NAN, 0.5, 0.5),
        (1920, 1080, 6., 0.5, 0.5),
        (1920, 1080, 1., -1., 0.5),
    ] {
        assert!(placement::frame(args.0, args.1, &canvas, args.2, args.3, args.4).is_err());
    }
    let huge = Canvas {
        width: u32::MAX,
        height: u32::MAX,
        ..canvas
    };
    assert!(placement::frame(1, 1, &huge, 5., 0.5, 0.5).is_err());
}
#[test]
fn layout_descriptors_and_media_types_reject_silently_ignored_controls() {
    let mut definition = catalog::builtins()
        .into_iter()
        .find(|d| d.id == "beam.framing")
        .unwrap();
    definition.validate().unwrap();
    definition.parameters.pop();
    assert!(definition.validate().is_err());
    let mut project = crate::fixtures::project();
    assert!(
        placement::compatible(&Processor::TextPlacement, &decision(&project.clips, 0)).is_err()
    );
    decision_mut(&mut project.clips, 0).title = Some(Default::default());
    assert!(placement::compatible(&Processor::TextPlacement, &decision(&project.clips, 0)).is_ok());
    assert!(placement::compatible(&Processor::Framing, &decision(&project.clips, 0)).is_err());
}
#[test]
fn layout_values_propagate_mapping_missing_and_type_failures() {
    let project = crate::fixtures::project();
    let mut instance = catalog::builtins()
        .into_iter()
        .find(|d| d.id == "beam.framing")
        .unwrap()
        .instantiate();
    assert_eq!(
        placement::number(&instance, &decision(&project.clips, 0), "scale", Time::ZERO).unwrap(),
        1.
    );
    assert!(
        placement::number(
            &instance,
            &decision(&project.clips, 0),
            "scale",
            Time {
                ticks: 0,
                timescale: 0
            }
        )
        .is_err()
    );
    instance.parameters.remove("scale");
    assert!(
        placement::number(&instance, &decision(&project.clips, 0), "scale", Time::ZERO).is_err()
    );
    instance
        .parameters
        .insert("scale".into(), Binding::constant(Value::Boolean(true)));
    assert!(
        placement::number(&instance, &decision(&project.clips, 0), "scale", Time::ZERO).is_err()
    );
}
