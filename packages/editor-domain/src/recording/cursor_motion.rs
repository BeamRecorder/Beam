//! Port of Beam's cursor spring: damping follows target velocity, with seek-independent checkpoints.
use super::{
    cursor_motion_types::MotionKey,
    cursor_style_types::CursorMotion,
    types::{CursorInteractionType, CursorPoint},
};

pub fn prepare(points: &[CursorPoint], settings: &CursorMotion) -> Vec<MotionKey> {
    let Some(first) = points.first() else {
        return vec![];
    };
    let mut state = MotionKey {
        x: first.cx,
        y: first.cy,
        ..Default::default()
    };
    let mut values = vec![state];
    for pair in points.windows(2) {
        let (before, after) = (&pair[0], &pair[1]);
        if after.time_ms == before.time_ms
            || matches!(
                after.interaction_type,
                Some(
                    CursorInteractionType::Click
                        | CursorInteractionType::DoubleClick
                        | CursorInteractionType::RightClick
                        | CursorInteractionType::MiddleClick
                        | CursorInteractionType::Mouseup
                )
            )
        {
            state = MotionKey {
                x: after.cx,
                y: after.cy,
                ..Default::default()
            };
        } else {
            state = step(
                state,
                [before.cx, before.cy],
                [after.cx, after.cy],
                (after.time_ms - before.time_ms) as f64 / 1000.,
                settings,
            );
        }
        values.push(state);
    }
    values
}
pub fn at(
    points: &[CursorPoint],
    keys: &[MotionKey],
    settings: &CursorMotion,
    time_ms: f64,
) -> Option<(f64, f64)> {
    let index = points
        .partition_point(|p| p.time_ms as f64 <= time_ms)
        .checked_sub(1)?;
    let point = &points[index];
    let state = *keys.get(index)?;
    let end = points.get(index + 1);
    let target = end.map_or([point.cx, point.cy], |next| {
        let progress = ((time_ms - point.time_ms as f64)
            / (next.time_ms - point.time_ms).max(1) as f64)
            .clamp(0., 1.);
        [
            point.cx + (next.cx - point.cx) * progress,
            point.cy + (next.cy - point.cy) * progress,
        ]
    });
    let value = step(
        state,
        [point.cx, point.cy],
        target,
        (time_ms - point.time_ms as f64) / 1000.,
        settings,
    );
    Some((value.x.clamp(0., 1.), value.y.clamp(0., 1.)))
}
pub fn step(
    state: MotionKey,
    previous: [f64; 2],
    target: [f64; 2],
    seconds: f64,
    settings: &CursorMotion,
) -> MotionKey {
    if settings.smoothing == 0. {
        return MotionKey {
            x: target[0],
            y: target[1],
            ..Default::default()
        };
    }
    if seconds <= 0. || !seconds.is_finite() {
        return state;
    }
    let mass = settings.spring_mass_multiplier;
    let stiffness = 420. - 300. * settings.smoothing;
    let omega = (stiffness / mass).sqrt();
    let zeta = 0.82 + settings.smoothing * 0.42;
    let (x, vx) = axis(
        state.x,
        state.vx,
        previous[0],
        target[0],
        seconds,
        omega,
        zeta,
    );
    let (y, vy) = axis(
        state.y,
        state.vy,
        previous[1],
        target[1],
        seconds,
        omega,
        zeta,
    );
    MotionKey { x, y, vx, vy }
}
fn axis(
    position: f64,
    velocity: f64,
    previous: f64,
    target: f64,
    dt: f64,
    omega: f64,
    zeta: f64,
) -> (f64, f64) {
    let speed = (target - previous) / dt;
    let displacement = position - previous;
    let relative = velocity - speed;
    let (distance, derivative) = if zeta < 1. - 0.0001 {
        let frequency = omega * (1. - zeta * zeta).sqrt();
        let b = (relative + zeta * omega * displacement) / frequency;
        let decay = (-zeta * omega * dt).exp();
        let (sin, cos) = (frequency * dt).sin_cos();
        (
            decay * (displacement * cos + b * sin),
            decay
                * (-displacement * frequency * sin + b * frequency * cos
                    - omega * zeta * (displacement * cos + b * sin)),
        )
    } else if (zeta - 1.).abs() <= 0.0001 {
        let decay = (-omega * dt).exp();
        let b = relative + omega * displacement;
        (
            decay * (displacement + b * dt),
            decay * (relative - omega * b * dt),
        )
    } else {
        let root = (zeta * zeta - 1.).sqrt();
        let first = -omega * (zeta - root);
        let second = -omega * (zeta + root);
        let a = (relative - second * displacement) / (first - second);
        let b = displacement - a;
        (
            a * (first * dt).exp() + b * (second * dt).exp(),
            a * first * (first * dt).exp() + b * second * (second * dt).exp(),
        )
    };
    (target + distance, speed + derivative)
}
