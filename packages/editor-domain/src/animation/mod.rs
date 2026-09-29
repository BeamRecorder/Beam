//! One evaluator for effects, geometry, camera, audio and generated elements.
pub mod types;
use crate::{EditorError, Result, timing::Time};
pub use types::*;

impl Value {
    pub fn validate(&self) -> Result<()> {
        let valid = match self {
            Self::Number(v) => v.is_finite(),
            Self::Point(v) => v.iter().all(|n| n.is_finite()),
            Self::Color(v) => v.iter().all(|n| n.is_finite() && (0. ..=1.).contains(n)),
            Self::Choice(v) | Self::Text(v) => v.len() <= 16_384 && !v.contains('\0'),
            Self::Boolean(_) => true,
        };
        if valid {
            Ok(())
        } else {
            Err(EditorError::Invalid("invalid typed parameter value".into()))
        }
    }
    pub fn number(&self) -> Option<f64> {
        if let Self::Number(v) = self {
            Some(*v)
        } else {
            None
        }
    }
}
impl Binding {
    pub fn constant(value: Value) -> Self {
        Self::Constant { value }
    }
    pub fn validate(&self) -> Result<()> {
        match self {
            Self::Constant { value } => value.validate(),
            Self::Curve { keys, .. } => {
                if keys.is_empty() {
                    return Err(EditorError::Invalid("curve requires keyframes".into()));
                }
                let mut ids = std::collections::HashSet::new();
                for (index, key) in keys.iter().enumerate() {
                    key.time.validate()?;
                    key.value.validate()?;
                    if key.id.is_nil()
                        || !ids.insert(key.id)
                        || std::mem::discriminant(&key.value)
                            != std::mem::discriminant(&keys[0].value)
                        || (index > 0 && keys[index - 1].time.compare(key.time).is_ge())
                    {
                        return Err(EditorError::Invalid(
                            "keyframes require unique IDs, sorted times and one value type".into(),
                        ));
                    }
                    if matches!(
                        key.value,
                        Value::Boolean(_) | Value::Choice(_) | Value::Text(_)
                    ) && !matches!(key.interpolation, Interpolation::Constant)
                    {
                        return Err(EditorError::Invalid(
                            "discrete values require constant interpolation".into(),
                        ));
                    }
                    if let Interpolation::Bezier { outgoing, incoming } = key.interpolation {
                        for t in [outgoing, incoming] {
                            if !t.time.is_finite()
                                || !(0. ..=1.).contains(&t.time)
                                || !t.value.is_finite()
                                || !(0. ..=1.).contains(&t.value)
                            {
                                return Err(EditorError::Invalid(
                                    "Bezier handles must be finite, normalized and monotonic"
                                        .into(),
                                ));
                            }
                        }
                    }
                }
                Ok(())
            }
        }
    }
    pub fn evaluate(&self, time: Time) -> Value {
        let Self::Curve { keys, .. } = self else {
            let Self::Constant { value } = self else {
                unreachable!()
            };
            return value.clone();
        };
        let index = keys.partition_point(|key| key.time.compare(time).is_le());
        let Some(left) = index.checked_sub(1).and_then(|i| keys.get(i)) else {
            return keys[0].value.clone();
        };
        let Some(right) = keys.get(index) else {
            return left.value.clone();
        };
        let amount =
            (time.seconds() - left.time.seconds()) / (right.time.seconds() - left.time.seconds());
        let amount = match left.interpolation {
            Interpolation::Constant => return left.value.clone(),
            Interpolation::Linear => amount,
            Interpolation::Bezier { outgoing, incoming } => bezier(amount, outgoing, incoming),
        };
        blend(&left.value, &right.value, amount)
    }
    pub fn at_sequence<T: crate::timing::ClipClock + ?Sized>(
        &self,
        clip: &T,
        sequence: Time,
    ) -> Result<Value> {
        sequence.validate()?;
        let time = match self {
            Self::Curve { space, .. } => crate::timing::map_time(clip, sequence, *space)?,
            _ => sequence,
        };
        Ok(self.evaluate(time))
    }
    pub fn regenerate_ids(&mut self) {
        if let Self::Curve { keys, .. } = self {
            for key in keys {
                key.id = uuid::Uuid::new_v4();
            }
        }
    }
}
fn blend(a: &Value, b: &Value, t: f64) -> Value {
    let lerp = |a: f64, b: f64| a + (b - a) * t;
    match (a, b) {
        (Value::Number(a), Value::Number(b)) => Value::Number(lerp(*a, *b)),
        (Value::Point(a), Value::Point(b)) => {
            Value::Point(std::array::from_fn(|i| lerp(a[i], b[i])))
        }
        (Value::Color(a), Value::Color(b)) => {
            Value::Color(std::array::from_fn(|i| lerp(a[i], b[i])))
        }
        _ => a.clone(),
    }
}
fn bezier(x: f64, outgoing: Tangent, incoming: Tangent) -> f64 {
    let cubic = |t: f64, a: f64, b: f64| {
        3. * (1. - t).powi(2) * t * a + 3. * (1. - t) * t * t * b + t * t * t
    };
    let (mut lo, mut hi) = (0., 1.);
    for _ in 0..48 {
        let t = (lo + hi) / 2.;
        if cubic(t, outgoing.time, 1. - incoming.time) < x {
            lo = t;
        } else {
            hi = t;
        }
    }
    cubic((lo + hi) / 2., outgoing.value, 1. - incoming.value)
}
