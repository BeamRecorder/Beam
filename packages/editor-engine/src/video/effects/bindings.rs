//! The same parameter kernels consume clip-source or post-mix sequence clocks.
use super::{binding_types::EffectScope, types::RenderState};
use crate::{Result, video::pipeline::media};
use beam_editor_domain::{
    effects::Instance,
    timing::{ClipClock, SequenceClock, Time},
};

pub(crate) fn evaluate(
    state: &RenderState,
    scope: EffectScope,
    pts: gst::ClockTime,
    consume: impl FnOnce(&dyn ClipClock, bool, &[Instance], Option<&Instance>, Time) -> Result<()>,
) -> Result<()> {
    let decisions = state.read().unwrap_or_else(|p| p.into_inner());
    match scope {
        EffectScope::Clip(id) => {
            let snapshot = decisions
                .get(&id)
                .ok_or_else(|| media("effect has no clip decisions"))?;
            let time = super::state::sequence_time(&snapshot.clip, pts)?;
            consume(
                snapshot.clip.as_ref(),
                snapshot.muted,
                &snapshot.clip.instances,
                snapshot.clip.generator.as_ref(),
                time,
            )
        }
        EffectScope::Aggregate(id) => {
            let snapshot = decisions
                .scopes
                .get(&id)
                .ok_or_else(|| media("effect has no scope decisions"))?;
            let time = Time {
                ticks: i64::try_from(pts.nseconds())
                    .map_err(|_| media("scope clock exceeds native timestamp budget"))?,
                timescale: 1_000_000_000,
            };
            consume(
                &SequenceClock,
                snapshot.muted,
                &snapshot.instances,
                None,
                time,
            )
        }
    }
}
