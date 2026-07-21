use crate::{
    catalog::CatalogSnapshot,
    model::{CaptureRequest, ScreenSelection, TrackKind, TrackMetadata},
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
