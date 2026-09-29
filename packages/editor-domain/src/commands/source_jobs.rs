//! Immutable analysis and source-only proxy plans; native hosts execute their jobs.
use crate::{
    Document, EditorError, MediaAsset, Project, Result,
    protocol::{AnalysisAlgorithm, ProxySettings, SourceAnalysis, SourceContext},
    recording::style_types::CursorMode,
};
use sha2::{Digest, Sha256};
use uuid::Uuid;

pub fn pin(document: &Document, context: &SourceContext) -> Result<MediaAsset> {
    if context.project_id.is_nil()
        || context.asset_id.is_nil()
        || context.idempotency_key.is_empty()
        || context.idempotency_key.len() > 128
        || context.idempotency_key.contains('\0')
        || context.project_id != document.project.id
    {
        return invalid("source jobs require explicit project, asset and revision context");
    }
    if context.expected_revision != document.revision {
        return Err(EditorError::Conflict {
            expected: context.expected_revision,
            actual: document.revision,
        });
    }
    let asset = document
        .project
        .assets
        .iter()
        .find(|asset| asset.id == context.asset_id)
        .ok_or_else(|| EditorError::Invalid("missing source job asset".into()))?;
    asset
        .identity
        .as_ref()
        .ok_or_else(|| EditorError::Invalid("source job asset has no immutable identity".into()))?
        .validate()?;
    crate::project::validation::project(&document.project)?;
    Ok(asset.clone())
}

/// Click analysis cannot infer events from a baked-in cursor or ordinary video pixels.
pub fn analyze(
    document: &Document,
    context: &SourceContext,
    algorithm: AnalysisAlgorithm,
) -> Result<SourceAnalysis> {
    let asset = pin(document, context)?;
    if asset.cursor_mode != CursorMode::Separated || asset.cursor.is_empty() {
        return invalid("zoomClicksV1 requires nonempty separated cursor telemetry");
    }
    let suggestions = match algorithm {
        AnalysisAlgorithm::ZoomClicksV1 => {
            crate::recording::suggestions::generate(&asset.cursor, asset.duration_ms, &[])
        }
    };
    Ok(SourceAnalysis {
        project_id: document.project.id,
        asset_id: asset.id,
        revision: document.revision,
        source_identity: asset
            .identity
            .ok_or_else(|| EditorError::Invalid("source identity disappeared".into()))?,
        telemetry_sha256: format!(
            "{:x}",
            Sha256::digest(serde_json::to_vec(asset.cursor.as_ref())?)
        ),
        algorithm,
        suggestions,
    })
}

/// A proxy is a derivative of the full source, never the current montage or its effects.
pub fn proxy_project(
    document: &Document,
    context: &SourceContext,
    settings: &ProxySettings,
) -> Result<Project> {
    let asset = pin(document, context)?;
    if !asset.has_video || asset.is_image {
        return invalid("source proxy requires continuous video");
    }
    let mut project = Project::new(document.project.name.clone());
    project.id = document.project.id;
    project.canvas.width = settings.width;
    project.canvas.height = settings.height;
    project.canvas.fps = settings.frame_rate.numerator;
    project.canvas.fps_denominator = settings.frame_rate.denominator;
    project.recording_style.cursor.enabled = false;
    let track_id = project
        .tracks
        .headers()
        .next()
        .ok_or_else(|| EditorError::Invalid("proxy lacks its video lane".into()))?
        .id;
    let clip = crate::Clip {
        id: Uuid::new_v4(),
        asset_id: asset.id,
        track_id,
        start_ms: 0,
        source_in_ms: 0,
        duration_ms: asset.duration_ms,
        effects: crate::Effects {
            auto_zoom: false,
            ..Default::default()
        },
        cursor_style: None,
        title: None,
        instances: vec![],
        generator: None,
        rate: Default::default(),
        animation_offset_ms: 0,
        link_group: None,
    };
    project.assets.push(asset);
    project.clips.try_push(clip)?;
    crate::project::validation::project(&project)?;
    Ok(project)
}
fn invalid<T>(message: &str) -> Result<T> {
    Err(EditorError::Invalid(message.into()))
}
