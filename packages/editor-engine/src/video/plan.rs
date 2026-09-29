//! Scheduling changes allocation, while preserving absolute document time.
use super::plan_types::{PreviewWindow, RenderPlan};
use crate::{Project, Result, video::pipeline::media};
use ges::prelude::*;
const PLAN_KEY: &str = "beam-editor-render-plan-v1";

impl RenderPlan {
    pub fn preview(project: &Project, position_ms: u64) -> Result<Self> {
        Self::preview_with_policy(project, position_ms, PreviewWindow::default())
    }
    pub fn preview_with_policy(
        project: &Project,
        position_ms: u64,
        policy: PreviewWindow,
    ) -> Result<Self> {
        if policy.behind_ms < policy.reload_margin_ms || policy.ahead_ms <= policy.reload_margin_ms
        {
            return Err(media(
                "preview preload must extend beyond its reload margin",
            ));
        }
        let duration = project.duration_ms();
        if position_ms > duration {
            return Err(media("preview position exceeds sequence duration"));
        }
        let mut plan = Self::range(
            project,
            position_ms.saturating_sub(policy.behind_ms),
            position_ms.saturating_add(policy.ahead_ms).min(duration),
        )?;
        plan.reload_margin_ms = policy.reload_margin_ms;
        Ok(plan)
    }
    pub fn range(project: &Project, start_ms: u64, end_ms: u64) -> Result<Self> {
        let duration_ms = project.duration_ms();
        if start_ms > end_ms || end_ms > duration_ms {
            return Err(media("render window exceeds sequence duration"));
        }
        let mut clips = std::collections::HashSet::new();
        for clip in project.clips.headers() {
            let end = clip
                .start_ms
                .checked_add(clip.duration_ms)
                .ok_or_else(|| media("render clip interval overflow"))?;
            if clip.start_ms < end_ms && end > start_ms {
                clips.insert(clip.id);
            }
        }
        let mut transitions = std::collections::HashSet::new();
        for transition in project.transitions.iter().filter(|t| t.instance.enabled) {
            let start =
                beam_editor_domain::effects::transitions::clock(&project.clips, transition)?
                    .start_ms;
            if start < end_ms && start + transition.duration_ms > start_ms {
                transitions.insert(transition.instance.id);
                clips.extend([transition.from_clip, transition.to_clip]);
            }
        }
        Ok(Self {
            start_ms,
            end_ms,
            duration_ms,
            reload_margin_ms: 0,
            clips,
            transitions,
        })
    }
    pub fn contains_position(&self, position_ms: u64) -> bool {
        let start = if self.start_ms == 0 {
            0
        } else {
            self.start_ms.saturating_add(self.reload_margin_ms)
        };
        let end = if self.end_ms == self.duration_ms {
            self.end_ms
        } else {
            self.end_ms.saturating_sub(self.reload_margin_ms)
        };
        position_ms >= start
            && (position_ms < end
                || position_ms == self.duration_ms && self.end_ms == self.duration_ms)
    }
}
pub(crate) fn attach(pipeline: &ges::Pipeline, plan: RenderPlan) {
    // SAFETY: only this module writes the private key, exactly once, before use.
    unsafe {
        pipeline.set_data(PLAN_KEY, plan);
    }
}
pub(crate) fn get(pipeline: &ges::Pipeline) -> Option<RenderPlan> {
    // SAFETY: attach stores this exact type and the caller retains the object.
    unsafe {
        pipeline
            .data::<RenderPlan>(PLAN_KEY)
            .map(|plan| plan.as_ref().clone())
    }
}
