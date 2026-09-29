//! Native retained capture controls and reader theme contracts.

#[path = "recording.rs"]
mod recording;
#[path = "region.rs"]
mod region;
#[path = "theming.rs"]
mod theming;

/// Checks only the relevant auxiliary scene after its actual bundle hydration.
pub(super) fn validate(scene: &crate::localization::Scene<'_>) {
    match scene.name {
        "app.mjs:mountRegionControls" => region::validate_controls(scene),
        "app.mjs:mountRegionActions" => region::validate_actions(scene),
        _ => {}
    }
    theming::validate(scene);
    recording::validate(scene);
}
