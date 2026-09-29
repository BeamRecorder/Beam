//! Built-in descriptors also drive script discovery and the generic inspector.
use super::types::*;
use crate::animation::Value;

fn number(key: &str, label: &str, default: f64, min: f64, max: f64) -> Parameter {
    Parameter {
        key: key.into(),
        label: label.into(),
        group: "General".into(),
        unit: String::new(),
        value_type: ParameterType::Number {
            min,
            max,
            step: 0.01,
        },
        default: Value::Number(default),
        animatable: true,
    }
}
fn definition(
    id: &str,
    label: &str,
    domain: Domain,
    processor: Processor,
    parameters: Vec<Parameter>,
) -> Definition {
    Definition {
        id: id.into(),
        version: 1,
        label: label.into(),
        domain,
        processor,
        parameters,
        timeline_region: false,
        targets: super::scope_types::clip_targets(),
    }
}
pub fn builtins() -> Vec<Definition> {
    let mut definitions = vec![
        definition(
            "beam.color",
            "Color correction",
            Domain::Video,
            Processor::ColorBalance,
            vec![
                number("brightness", "Brightness", 0., -1., 1.),
                number("saturation", "Saturation", 1., 0., 2.),
                number("contrast", "Contrast", 1., 0., 2.),
                number("hue", "Hue", 0., -1., 1.),
            ],
        ),
        definition(
            "beam.transform",
            "Transform",
            Domain::Video,
            Processor::Transform,
            vec![
                number("scaleX", "Horizontal scale", 1., 0.01, 20.),
                number("scaleY", "Vertical scale", 1., 0.01, 20.),
                number("x", "Horizontal position", 0., -5., 5.),
                number("y", "Vertical position", 0., -5., 5.),
                number("rotation", "Rotation", 0., -3600., 3600.),
                number("anchorX", "Horizontal anchor", 0.5, 0., 1.),
                number("anchorY", "Vertical anchor", 0.5, 0., 1.),
            ],
        ),
        definition(
            "beam.opacity",
            "Opacity",
            Domain::Video,
            Processor::Opacity,
            vec![number("opacity", "Opacity", 1., 0., 1.)],
        ),
        definition(
            "beam.framing",
            "Source framing",
            Domain::Video,
            Processor::Framing,
            vec![
                number("scale", "Scale", 1., 0.05, 5.),
                number("x", "Horizontal center", 0.5, 0., 1.),
                number("y", "Vertical center", 0.5, 0., 1.),
            ],
        ),
        definition(
            "beam.textPlacement",
            "Text placement",
            Domain::Video,
            Processor::TextPlacement,
            vec![
                number("x", "Horizontal position", 0.5, 0., 1.),
                number("y", "Vertical position", 0.5, 0., 1.),
            ],
        ),
        definition(
            "beam.gain",
            "Volume",
            Domain::Audio,
            Processor::Gain,
            vec![number("volume", "Volume", 1., 0., 10.)],
        ),
        definition(
            "beam.crossfade",
            "Crossfade",
            Domain::Transition,
            Processor::Crossfade,
            vec![],
        ),
        definition(
            "beam.wipe",
            "Wipe left",
            Domain::Transition,
            Processor::Wipe {
                direction: WipeDirection::Left,
            },
            vec![],
        ),
        definition(
            "beam.solid",
            "Solid color",
            Domain::Generator,
            Processor::Solid,
            vec![Parameter {
                key: "color".into(),
                label: "Color".into(),
                group: "Appearance".into(),
                unit: String::new(),
                value_type: ParameterType::Color,
                default: Value::Color([1., 0.35, 0.08, 1.]),
                animatable: true,
            }],
        ),
    ];
    let mut zoom = definition(
        "beam.camera.zoom",
        "Camera zoom",
        Domain::Video,
        Processor::CameraZoom,
        vec![
            number("scale", "Scale", 2., 1., 5.),
            Parameter {
                key: "center".into(),
                label: "Center".into(),
                group: "Camera".into(),
                unit: "sourceNormalized".into(),
                value_type: ParameterType::Point,
                default: Value::Point([0.5; 2]),
                animatable: true,
            },
            Parameter {
                key: "followCursor".into(),
                label: "Follow cursor".into(),
                group: "Camera".into(),
                unit: String::new(),
                value_type: ParameterType::Boolean,
                default: Value::Boolean(true),
                animatable: true,
            },
            number("entryMs", "Entry", 500., 0., 10_000.),
            number("exitMs", "Exit", 500., 0., 10_000.),
            Parameter {
                key: "interpolation".into(),
                label: "Motion".into(),
                group: "Camera".into(),
                unit: String::new(),
                value_type: ParameterType::Choice {
                    options: vec!["linear".into(), "ease".into(), "legacySpring".into()],
                },
                default: Value::Choice("ease".into()),
                animatable: false,
            },
        ],
    );
    for parameter in &mut zoom.parameters {
        parameter.group = "Camera".into();
        if ["entryMs", "exitMs"].contains(&parameter.key.as_str()) {
            parameter.unit = "milliseconds".into();
        }
        if ["entryMs", "exitMs"].contains(&parameter.key.as_str()) {
            parameter.animatable = false;
        }
    }
    zoom.timeline_region = true;
    definitions.push(zoom);
    let mut cursor = definition(
        "beam.cursor",
        "Cursor overlay",
        Domain::Video,
        Processor::Cursor,
        vec![
            number("opacity", "Opacity", 1., 0., 1.),
            number("sizeScale", "Size multiplier", 1., 0.1, 10.),
            number("clickOpacity", "Click pulse", 1., 0., 1.),
        ],
    );
    cursor.timeline_region = true;
    definitions.push(cursor);
    let scoped: Vec<_> = definitions
        .iter()
        .filter_map(|definition| {
            let targets = super::scopes::supported(&definition.processor);
            (targets.len() > 1).then(|| {
                let mut next = definition.clone();
                next.version = 2;
                next.targets = targets;
                next
            })
        })
        .collect();
    definitions.extend(scoped);
    definitions
}
