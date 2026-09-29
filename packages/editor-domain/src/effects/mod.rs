//! Catalogue validation, parameter binding and ordered instance decisions.
pub mod catalog;
pub mod migration;
pub mod native_contract;
pub mod pack;
pub mod pack_types;
pub mod placement;
pub mod placement_types;
pub mod preset_types;
pub mod presets;
pub mod scope_types;
pub mod scopes;
pub mod shaders;
pub mod transition_types;
pub mod transitions;
pub mod types;
use crate::{
    EditorError, Result,
    animation::{Binding, Value},
    timing::Time,
};
pub use pack_types::{CatalogVersion, ExtensionPack, PackDraft, PackProvenance};
pub use scope_types::ScopeTarget;
use std::collections::{BTreeMap, HashSet};
pub use types::*;

pub fn definition<'a>(catalog: &'a [Definition], id: &str, version: u32) -> Result<&'a Definition> {
    catalog
        .iter()
        .find(|d| d.id == id && d.version == version)
        .ok_or_else(|| EditorError::Invalid(format!("missing definition {id}@{version}")))
}
impl Definition {
    pub fn validate(&self) -> Result<()> {
        if self.id.is_empty()
            || self.id.len() > 128
            || !self
                .id
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || b"._-".contains(&c))
            || self.version == 0
            || self.label.is_empty()
            || self.label.len() > 256
        {
            return Err(EditorError::Invalid("invalid definition identity".into()));
        }
        let mut keys = HashSet::new();
        for p in &self.parameters {
            if p.key.is_empty()
                || !p
                    .key
                    .bytes()
                    .all(|c| c.is_ascii_alphanumeric() || c == b'_')
                || !keys.insert(&p.key)
            {
                return Err(EditorError::Invalid(
                    "invalid or duplicate parameter key".into(),
                ));
            }
            p.validate_value(&p.default)?;
        }
        shaders::validate(self)?;
        scopes::definition(self)?;
        native_contract::validate(self)?;
        if matches!(
            self.processor,
            Processor::Crossfade | Processor::Wipe { .. }
        ) && !self.parameters.is_empty()
        {
            return Err(EditorError::Invalid(
                "this transition processor has no configurable parameters".into(),
            ));
        }
        let correct = match self.processor {
            Processor::Crossfade | Processor::Wipe { .. } | Processor::TransitionShader { .. } => {
                self.domain == Domain::Transition
            }
            Processor::Gain => self.domain == Domain::Audio,
            Processor::Solid => self.domain == Domain::Generator,
            _ => self.domain == Domain::Video,
        };
        if !correct {
            return Err(EditorError::Invalid(
                "processor and definition domain differ".into(),
            ));
        }
        crate::recording::effect_validation::definition(self)?;
        placement::definition(self)
    }
    pub fn instantiate(&self) -> Instance {
        Instance {
            id: uuid::Uuid::new_v4(),
            name: None,
            definition_id: self.id.clone(),
            definition_version: self.version,
            enabled: true,
            range: None,
            parameters: self
                .parameters
                .iter()
                .map(|p| (p.key.clone(), Binding::constant(p.default.clone())))
                .collect(),
        }
    }
}
impl Parameter {
    pub fn validate_value(&self, value: &Value) -> Result<()> {
        value.validate()?;
        let valid = match (&self.value_type, value) {
            (ParameterType::Number { min, max, step }, Value::Number(n)) => {
                min.is_finite()
                    && max.is_finite()
                    && step.is_finite()
                    && *step > 0.
                    && min <= max
                    && (min..=max).contains(&n)
            }
            (ParameterType::Point, Value::Point(_))
            | (ParameterType::Color, Value::Color(_))
            | (ParameterType::Text, Value::Text(_))
            | (ParameterType::Boolean, Value::Boolean(_)) => true,
            (ParameterType::Choice { options }, Value::Choice(v)) => options.contains(v),
            _ => false,
        };
        if valid {
            Ok(())
        } else {
            Err(EditorError::Invalid(format!(
                "parameter {} has an invalid type or bounds",
                self.key
            )))
        }
    }
    pub fn validate_binding(&self, binding: &Binding) -> Result<()> {
        binding.validate()?;
        match binding {
            Binding::Constant { value } => self.validate_value(value),
            Binding::Curve { keys, .. } => {
                if !self.animatable {
                    return Err(EditorError::Invalid(format!(
                        "{} cannot be animated",
                        self.key
                    )));
                }
                for key in keys {
                    self.validate_value(&key.value)?;
                }
                Ok(())
            }
        }
    }
}
impl Instance {
    pub fn validate(&self, catalog: &[Definition]) -> Result<()> {
        if self.id.is_nil() {
            return Err(EditorError::Invalid("nil effect instance ID".into()));
        }
        if self
            .name
            .as_ref()
            .is_some_and(|name| name.trim().is_empty() || name.len() > 256 || name.contains('\0'))
        {
            return Err(EditorError::Invalid(
                "instance name must be nonempty, at most 256 bytes and contain no NUL".into(),
            ));
        }
        let d = definition(catalog, &self.definition_id, self.definition_version)?;
        if let Some(range) = self.range {
            range.validate()?;
        }
        if self.parameters.len() != d.parameters.len() {
            return Err(EditorError::Invalid(
                "parameter keys differ from definition".into(),
            ));
        }
        for p in &d.parameters {
            p.validate_binding(
                self.parameters
                    .get(&p.key)
                    .ok_or_else(|| EditorError::Invalid(format!("missing parameter {}", p.key)))?,
            )?;
        }
        crate::recording::effect_validation::instance(self, d)
    }
    pub fn evaluated<T: crate::timing::ClipClock + ?Sized>(
        &self,
        clip: &T,
        sequence: Time,
    ) -> Result<BTreeMap<String, Value>> {
        sequence.validate()?;
        self.parameters
            .iter()
            .map(|(key, binding)| Ok((key.clone(), binding.at_sequence(clip, sequence)?)))
            .collect()
    }
    pub fn active<T: crate::timing::ClipClock + ?Sized>(
        &self,
        clip: &T,
        sequence: Time,
    ) -> Result<bool> {
        sequence.validate()?;
        let active = match self.range {
            Some(range) => range.contains(crate::timing::map_time(clip, sequence, range.space)?),
            None => true,
        };
        Ok(self.enabled && active)
    }
    pub fn duplicate(&self) -> Self {
        let mut result = self.clone();
        result.id = uuid::Uuid::new_v4();
        for binding in result.parameters.values_mut() {
            binding.regenerate_ids();
        }
        result
    }
}
