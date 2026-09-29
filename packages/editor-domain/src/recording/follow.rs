//! Balanced cursor follow with a safe zone, hysteresis, and direction locking.
use super::{
    playback::clamp,
    types::{Camera, Follow},
};

/// Updates a source-time camera target; backward seeks reset the follow state.
pub fn target(
    state: &mut Follow,
    cursor: Option<Camera>,
    focus: Camera,
    strength: f64,
    time_ms: f64,
) -> Camera {
    let fallback = clamp(focus);
    if strength < 0.01 || (state.initialized && time_ms + 0.5 < state.last_ms) {
        *state = Follow {
            last_ms: time_ms,
            lock_until_ms: time_ms,
            target: fallback,
            frozen: fallback,
            ..Follow::default()
        };
        return fallback;
    }
    state.last_ms = time_ms;
    if !state.initialized {
        state.initialized = true;
        state.target = fallback;
        state.frozen = fallback;
    }
    if !state.full {
        state.target = fallback;
        state.frozen = fallback;
        if strength < 0.99 {
            return fallback;
        }
        state.full = true;
    }
    if strength < 0.99 {
        return clamp(Camera {
            scale: focus.scale,
            ..state.frozen
        });
    }
    let Some(cursor) = cursor else {
        return Camera {
            scale: focus.scale,
            ..state.target
        };
    };
    if time_ms < state.lock_until_ms {
        return Camera {
            scale: focus.scale,
            ..state.target
        };
    }
    let visible = 1. / (2. * focus.scale.max(1.));
    let safe = visible * 0.5;
    let hysteresis = visible * 0.05;
    let axis = |value: f64, center: f64| {
        if value < center - safe {
            value + safe - hysteresis
        } else if value > center + safe {
            value - safe + hysteresis
        } else {
            center
        }
    };
    let next = clamp(Camera {
        x: axis(cursor.x, state.target.x),
        y: axis(cursor.y, state.target.y),
        scale: focus.scale,
    });
    if next.x != state.target.x || next.y != state.target.y {
        state.target = next;
        state.lock_until_ms = time_ms + 4000. / 11.95;
    }
    state.frozen = state.target;
    Camera {
        scale: focus.scale,
        ..state.target
    }
}
