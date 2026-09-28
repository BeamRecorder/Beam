//! Converts imported JavaScript WGSL modules to validated renderer effects.

use argui_paint::EffectId;
use argui_render::{
    EffectDefinition, EffectParameter, EffectParameterType, EffectPassDefinition, EffectRegistry,
};
use serde_json::Value;

/// Builds a renderer registry from source definitions registered by JavaScript.
///
/// `json` is an array of `{id, source, parameters}` objects. Each parameter
/// has a name and currently supports the scalar `f32` type. Returns a fully
/// validated effect registry including the engine's scroll effects; no
/// definition is installed if any source fails.
///
/// # Errors
/// Returns an error for malformed metadata, duplicate IDs, or invalid WGSL.
pub fn registry_from_json(json: &str) -> Result<EffectRegistry, String> {
    let values: Vec<Value> = serde_json::from_str(json).map_err(|error| error.to_string())?;
    let definitions = values
        .iter()
        .map(parse_definition)
        .collect::<Result<Vec<_>, _>>()?;
    let engine = argui_effects::registry().map_err(|error| error.to_string())?;
    EffectRegistry::new(engine.definitions().iter().cloned().chain(definitions))
        .map_err(|error| error.to_string())
}

/// Converts one JSON effect descriptor to the renderer definition.
///
/// `value` must contain its namespaced ID, WGSL source, and parameter list.
/// Returns the definition or a descriptive metadata error.
///
/// # Errors
/// Returns an error when a required field or parameter type is invalid.
fn parse_definition(value: &Value) -> Result<EffectDefinition, String> {
    let id = field(value, "id")?;
    let source = field(value, "source")?;
    let parameters = value
        .get("parameters")
        .and_then(Value::as_array)
        .ok_or("effect parameters must be an array")?
        .iter()
        .map(|parameter| {
            let name = field(parameter, "name")?;
            if field(parameter, "type")? != "f32" {
                return Err("only f32 effect parameters are supported".into());
            }
            Ok(EffectParameter::new(
                name.to_string(),
                EffectParameterType::F32,
            ))
        })
        .collect::<Result<Vec<_>, String>>()?;
    Ok(EffectDefinition::new(
        EffectId::from_owned(id.to_string()),
        parameters,
        [EffectPassDefinition::fragment("main", source.to_string())],
    ))
}

/// Reads a required string `name` from one JSON `value`.
///
/// Returns the borrowed field or an error when the field is absent or not text.
///
/// # Errors
/// Returns an error naming the malformed field.
fn field<'a>(value: &'a Value, name: &str) -> Result<&'a str, String> {
    value
        .get(name)
        .and_then(Value::as_str)
        .ok_or_else(|| format!("effect {name} must be a string"))
}
