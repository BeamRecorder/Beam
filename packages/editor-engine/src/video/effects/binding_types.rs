//! Buffer timestamps have one of two native origins.
#[derive(Clone, Copy)]
pub(crate) enum EffectScope {
    Clip(uuid::Uuid),
    Aggregate(uuid::Uuid),
}
