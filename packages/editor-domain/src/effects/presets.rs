use super::{Definition, Instance, definition, preset_types::Preset};
use crate::{EditorError, Result};
use std::collections::HashSet;

impl Preset {
    pub fn validate(&self, catalog: &[Definition]) -> Result<()> {
        if self.id.is_empty()
            || self.id.len() > 128
            || !self
                .id
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || b"._-".contains(&byte))
            || self.version == 0
            || self.label.trim().is_empty()
            || self.label.len() > 256
            || self.label.contains('\0')
        {
            return Err(EditorError::Invalid("invalid preset identity".into()));
        }
        definition(catalog, &self.definition_id, self.definition_version)?.validate()?;
        let candidate = Instance {
            id: uuid::Uuid::from_u128(1),
            name: None,
            definition_id: self.definition_id.clone(),
            definition_version: self.definition_version,
            enabled: true,
            range: None,
            parameters: self.parameters.clone(),
        };
        candidate.validate(catalog)
    }
    /// Identity, placement, enabled state, range and neighbouring instance order stay intact.
    pub fn apply(&self, instance: &mut Instance, catalog: &[Definition]) -> Result<()> {
        self.validate(catalog)?;
        if instance.definition_id != self.definition_id
            || instance.definition_version != self.definition_version
        {
            return Err(EditorError::Invalid(
                "preset and target definition version differ".into(),
            ));
        }
        let mut candidate = instance.clone();
        candidate.parameters = self.parameters.clone();
        for binding in candidate.parameters.values_mut() {
            binding.regenerate_ids();
        }
        candidate.validate(catalog)?;
        instance.parameters = candidate.parameters;
        Ok(())
    }
}

pub fn validate_catalog(presets: &[Preset], definitions: &[Definition]) -> Result<()> {
    let mut versions = HashSet::new();
    for preset in presets {
        preset.validate(definitions)?;
        if !versions.insert((&preset.id, preset.version)) {
            return Err(EditorError::Invalid("duplicate preset version".into()));
        }
    }
    Ok(())
}

pub fn builtins() -> Vec<Preset> {
    use crate::{
        animation::{Binding, Interpolation, Keyframe, Value},
        timing::{Time, TimeSpace},
    };
    let catalog = super::catalog::builtins();
    let color = definition(&catalog, "beam.color", 1).expect("built-in color definition");
    let mut parameters = color.instantiate().parameters;
    parameters.insert("brightness".into(), Binding::constant(Value::Number(0.05)));
    parameters.insert("saturation".into(), Binding::constant(Value::Number(1.1)));
    let mut presets = vec![
        Preset {
            id: "beam.color.warm".into(),
            version: 1,
            label: "Warm colors".into(),
            definition_id: color.id.clone(),
            definition_version: 1,
            parameters,
        },
        Preset {
            id: "beam.opacity.fadeIn".into(),
            version: 1,
            label: "Fade in".into(),
            definition_id: "beam.opacity".into(),
            definition_version: 1,
            parameters: [(
                "opacity".into(),
                Binding::Curve {
                    space: TimeSpace::ClipLocal,
                    keys: vec![
                        Keyframe {
                            id: uuid::Uuid::from_u128(1),
                            time: Time::ZERO,
                            value: Value::Number(0.),
                            interpolation: Interpolation::Linear,
                        },
                        Keyframe {
                            id: uuid::Uuid::from_u128(2),
                            time: Time::milliseconds(1000),
                            value: Value::Number(1.),
                            interpolation: Interpolation::Linear,
                        },
                    ],
                },
            )]
            .into_iter()
            .collect(),
        },
    ];
    let mut fade_out = presets[1].clone();
    fade_out.id = "beam.opacity.fadeOut".into();
    fade_out.label = "Fade out".into();
    if let Some(Binding::Curve { keys, .. }) = fade_out.parameters.get_mut("opacity") {
        keys[0].value = Value::Number(1.);
        keys[1].value = Value::Number(0.);
    }
    presets.push(fade_out);
    for (definition_id, id, label, key, value) in [
        (
            "beam.framing",
            "beam.framing.centered",
            "Centered crop",
            "scale",
            1.25,
        ),
        (
            "beam.gain",
            "beam.gain.voice",
            "Voice boost",
            "volume",
            1.25,
        ),
    ] {
        let definition =
            definition(&catalog, definition_id, 1).expect("built-in preset definition");
        let mut parameters = definition.instantiate().parameters;
        parameters.insert(key.into(), Binding::constant(Value::Number(value)));
        presets.push(Preset {
            id: id.into(),
            version: 1,
            label: label.into(),
            definition_id: definition.id.clone(),
            definition_version: 1,
            parameters,
        });
    }
    let scoped: Vec<_> = presets
        .iter()
        .filter_map(|preset| {
            definition(&catalog, &preset.definition_id, 2)
                .ok()
                .map(|_| {
                    let mut next = preset.clone();
                    next.version = 2;
                    next.definition_version = 2;
                    for binding in next.parameters.values_mut() {
                        if let Binding::Curve { space, .. } = binding {
                            *space = TimeSpace::Sequence;
                        }
                    }
                    next
                })
        })
        .collect();
    presets.extend(scoped);
    presets
}
