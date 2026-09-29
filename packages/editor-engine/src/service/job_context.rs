//! Job identity names either an exact sequence or an immutable source.
use beam_editor_domain::protocol::{JobContext, JobScope};
use uuid::Uuid;
pub fn project(context: &JobContext) -> Uuid {
    match context {
        JobContext::Sequence { context } => context.project_id,
        JobContext::Source { context } => context.project_id,
    }
}
pub fn revision(context: &JobContext) -> u64 {
    match context {
        JobContext::Sequence { context } => context.expected_revision,
        JobContext::Source { context } => context.expected_revision,
    }
}
pub fn key(context: &JobContext) -> &str {
    match context {
        JobContext::Sequence { context } => &context.idempotency_key,
        JobContext::Source { context } => &context.idempotency_key,
    }
}
pub fn scope(context: &JobContext) -> JobScope {
    match context {
        JobContext::Sequence { context } => JobScope::Sequence {
            sequence_id: context.sequence_id,
        },
        JobContext::Source { context } => JobScope::Source {
            asset_id: context.asset_id,
        },
    }
}
pub fn valid_scope(scope: &JobScope) -> bool {
    match scope {
        JobScope::Sequence { sequence_id } => !sequence_id.is_nil(),
        JobScope::Source { asset_id } => !asset_id.is_nil(),
    }
}
