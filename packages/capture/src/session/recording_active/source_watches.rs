use crate::{
    catalog::CatalogSnapshot,
    model::{
        CaptureRequest, ScreenSelection, SourceDescriptor, SourceKind, SystemAudioSelection,
        TrackKind, TrackMetadata,
    },
    session::{periodic_reporter::SourceWatch, recording_support::track_for},
};

pub(super) fn source_watches(
    request: &CaptureRequest,
    snapshot: &CatalogSnapshot,
    tracks: &[TrackMetadata],
) -> Vec<SourceWatch> {
    let mut selected = Vec::new();
    if let Some(ScreenSelection::Source { source_id }) = &request.screen {
        selected.push((TrackKind::Screen, source_id));
    }
    if let Some(selection) = &request.microphone {
        selected.push((TrackKind::Microphone, &selection.source_id));
    }
    if let Some(selection) = &request.camera {
        selected.push((TrackKind::Camera, &selection.source_id));
    }
    if let Some(SystemAudioSelection::OutputDevice(source_id)) = &request.system_audio {
        selected.push((TrackKind::SystemAudio, source_id));
    } else if request.system_audio.is_some()
        && let Some(source) = default_source(snapshot, SourceKind::SystemAudio)
    {
        selected.push((TrackKind::SystemAudio, &source.id));
    }
    selected
        .into_iter()
        .filter_map(|(kind, source_id)| {
            let track = track_for(tracks, kind)?;
            let source = snapshot
                .sources
                .iter()
                .find(|source| &source.id == source_id)?;
            Some(SourceWatch::new(track.track_id, source.clone()))
        })
        .collect()
}

fn default_source(snapshot: &CatalogSnapshot, kind: SourceKind) -> Option<&SourceDescriptor> {
    snapshot
        .sources
        .iter()
        .find(|source| source.kind == kind && source.is_default)
        .or_else(|| snapshot.sources.iter().find(|source| source.kind == kind))
}
