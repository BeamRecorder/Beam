use beam_editor_domain::{
    Clip, Effects, Project,
    collections::PersistentItem,
    effects::definition,
    protocol::view_types::ClipOverview,
    timing::{Time, TimeRange, TimeSpace},
};
use uuid::Uuid;

#[test]
fn timeline_overview_counts_regions_and_omits_parameter_payloads() {
    let project = Project::new("Projection".into());
    let opacity = definition(&project.definitions, "beam.opacity", 1)
        .unwrap()
        .instantiate();
    let zoom = definition(&project.definitions, "beam.camera.zoom", 1)
        .unwrap()
        .instantiate();
    let mut ranged = opacity.duplicate();
    ranged.range = Some(TimeRange {
        space: TimeSpace::ClipLocal,
        start: Time::ZERO,
        end: Time::milliseconds(1000),
    });
    let clip = Clip {
        id: Uuid::new_v4(),
        asset_id: Uuid::new_v4(),
        track_id: project.tracks.headers().next().unwrap().id,
        start_ms: 1000,
        source_in_ms: 0,
        duration_ms: 1000,
        effects: Effects::default(),
        cursor_style: None,
        title: None,
        instances: vec![opacity, zoom, ranged],
        rate: Default::default(),
        animation_offset_ms: 0,
        generator: None,
        link_group: None,
    };
    let overview = ClipOverview::from_header(&clip.header(), &project.definitions);
    assert_eq!(overview.effect_count, 3);
    assert_eq!(overview.region_count, 2);
    assert_eq!(overview.id, clip.id);
    let json = serde_json::to_value(&overview).unwrap();
    assert!(json.get("instances").is_none());
    assert!(json.get("parameters").is_none());
    assert_eq!(
        serde_json::from_value::<ClipOverview>(json).unwrap(),
        overview
    );
}

#[test]
fn lane_overview_has_counts_without_exposing_instances_or_keys() {
    let project = Project::new("Track projection".into());
    let mut track =
        beam_editor_domain::Track::new("Lane".into(), beam_editor_domain::TrackKind::Video);
    let mut opacity = definition(&project.definitions, "beam.opacity", 2)
        .unwrap()
        .instantiate();
    opacity.range = Some(TimeRange {
        space: TimeSpace::Sequence,
        start: Time::ZERO,
        end: Time::milliseconds(1000),
    });
    track.instances.push(opacity);
    let overview = beam_editor_domain::protocol::TrackOverview::from_header(
        &track.header(),
        &project.definitions,
    );
    assert_eq!(overview.effect_count, 1);
    assert_eq!(overview.region_count, 1);
    let value = serde_json::to_value(overview).unwrap();
    assert_eq!(value["name"], "Lane");
    assert!(value.get("instances").is_none());
    assert!(value.get("keyframeIds").is_none());
}
