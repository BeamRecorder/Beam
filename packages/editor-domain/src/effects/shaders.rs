//! Explicit extension contracts; native compilation validates the program itself.
use super::{Definition, Domain, ParameterType, Processor};
use crate::{EditorError, Result};

pub fn validate(definition: &Definition) -> Result<()> {
    let (fragment, transition) = match &definition.processor {
        Processor::Shader { fragment } => (fragment, false),
        Processor::TransitionShader { mask_fragment } => (mask_fragment, true),
        _ => return Ok(()),
    };
    if definition.parameters.iter().any(|p| {
        p.key.starts_with("beam_")
            || p.key.starts_with("gl_")
            || ["tex", "v_texcoord", "time", "width", "height", "progress"]
                .contains(&p.key.as_str())
    }) {
        return Err(EditorError::Invalid(
            "shader parameter name is reserved by the backend".into(),
        ));
    }
    if definition
        .parameters
        .iter()
        .any(|p| !matches!(p.value_type, ParameterType::Number { .. }))
    {
        return Err(EditorError::Invalid(
            "shader uniforms currently require numeric parameters".into(),
        ));
    }
    if definition.parameters.iter().any(|p| {
        !p.key
            .as_bytes()
            .first()
            .is_some_and(|byte| byte.is_ascii_alphabetic() || *byte == b'_')
            || matches!(p.value_type, ParameterType::Number {min,max,..}
                if !(min as f32).is_finite() || !(max as f32).is_finite())
    }) {
        return Err(EditorError::Invalid(
            "shader uniforms require GLSL identifiers and finite 32-bit bounds".into(),
        ));
    }
    let valid = fragment.len() <= 65_536
        && !fragment.contains('\0')
        && if transition {
            definition.domain == Domain::Transition
                && fragment.contains("float beam_transition")
                && !fragment.contains("void main")
        } else {
            definition.domain == Domain::Video && fragment.contains("void main")
        };
    if !valid {
        return Err(EditorError::Invalid(if transition {"transition shader requires a bounded float beam_transition(vec2 uv,float progress) mask"} else {"shader must be a bounded video fragment program"}.into()));
    }
    Ok(())
}
