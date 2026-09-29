//! Analytical critically damped spring ported from Beam's zoom-spring.ts.
use super::types::{Camera, Velocity};

/// Integrates one bounded camera step and updates the caller-owned velocity.
pub fn step(
    current: Camera,
    target: Camera,
    velocity: &mut Velocity,
    delta_ms: f64,
    focus_omega: f64,
) -> Camera {
    let dt = (delta_ms / 1000.).clamp(0.001, 0.08);
    let (x, vx) = axis(current.x, target.x, velocity.x, dt, focus_omega);
    let (y, vy) = axis(current.y, target.y, velocity.y, dt, focus_omega);
    let (scale, vs) = axis(current.scale, target.scale, velocity.scale, dt, 10.);
    *velocity = Velocity {
        x: vx,
        y: vy,
        scale: vs,
    };
    Camera { x, y, scale }
}
fn axis(current: f64, target: f64, velocity: f64, dt: f64, omega: f64) -> (f64, f64) {
    let d = current - target;
    let decay = (-omega * dt).exp();
    (
        target + (d + (velocity + omega * d) * dt) * decay,
        (velocity - omega * (velocity + omega * d) * dt) * decay,
    )
}
