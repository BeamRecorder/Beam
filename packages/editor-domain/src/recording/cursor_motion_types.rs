//! Analytical motion checkpoints attached to immutable captured cursor samples.
#[derive(Clone, Copy, Debug, Default)]
pub struct MotionKey {
    pub x: f64,
    pub y: f64,
    pub vx: f64,
    pub vy: f64,
}
