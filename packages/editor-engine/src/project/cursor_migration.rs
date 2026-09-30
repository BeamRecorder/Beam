//! Enriches native projects created before captured cursor roles were retained.
use super::{cursor_import, recording, validation};
use crate::{Project, Result};
use beam_editor_domain::recording::suggestions;
use beam_media_manifest::{ProjectManifest, SessionManifest, TrackKind};
use beam_screen::cursor::{CursorEvent, CursorTelemetrySidecar};
use std::path::Path;

/// Restores immutable capture telemetry without changing clip edits or source bytes.
pub fn hydrate(root: &Path, project: &mut Project) -> Result<()> {
    if !root.join("project.json").exists() || !project.assets.iter().any(missing_roles) {
        return Ok(());
    }
    let manifest: ProjectManifest = recording::read(&root.join("project.json"))?;
    for reference in manifest.sessions {
        let session: SessionManifest = recording::read(&validation::source_path(
            root,
            &format!("{}/manifest.json", reference.relative_path),
        )?)?;
        let events_relative = format!("{}/cursor/cursor.json", reference.relative_path);
        if !root.join(&events_relative).exists() {
            continue;
        }
        let events: Vec<CursorEvent> =
            recording::read(&validation::source_path(root, &events_relative)?)?;
        let telemetry: CursorTelemetrySidecar = recording::read(&validation::source_path(
            root,
            &format!("{}/cursor/telemetry.json", reference.relative_path),
        )?)?;
        if telemetry.version != 2 {
            return Err(crate::EditorError::Invalid(
                "unsupported cursor telemetry version".into(),
            ));
        }
        for track in session
            .tracks
            .iter()
            .filter(|track| track.kind == TrackKind::Screen)
        {
            for segment in &track.segments {
                let relative = format!("{}/{}", reference.relative_path, segment.path);
                for asset in project
                    .assets
                    .iter_mut()
                    .filter(|asset| asset.path == relative && missing_roles(asset))
                {
                    asset.cursor = suggestions::normalize(
                        &cursor_import::points(
                            &telemetry.samples,
                            &events,
                            segment.start_ns / 1_000_000,
                            asset.duration_ms,
                        ),
                        asset.duration_ms,
                    )
                    .into();
                }
            }
        }
    }
    Ok(())
}
fn missing_roles(asset: &crate::MediaAsset) -> bool {
    asset.recording
        && !asset.cursor.is_empty()
        && asset
            .cursor
            .iter()
            .all(|p| p.cursor_type.is_none() && p.visible.is_none())
}
