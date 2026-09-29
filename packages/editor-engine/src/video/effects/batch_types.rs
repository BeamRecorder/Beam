//! Instance identity remains distinct when pixel-local operations share a pass.
use uuid::Uuid;

#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum BatchKind {
    Color,
    Opacity,
}
#[derive(Clone, Copy)]
pub(crate) struct BatchOperation {
    pub id: Uuid,
    pub kind: BatchKind,
}
/// Eight scalar-parameter operations fit a conservative GLSL uniform budget.
pub(crate) const MAX_BATCH_OPERATIONS: usize = 8;
pub(crate) struct ColorUniforms {
    pub coefficients: [f32; 9],
    pub constant: f32,
    pub passthrough: bool,
}
