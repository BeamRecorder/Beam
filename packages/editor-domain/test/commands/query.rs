use beam_editor_domain::{
    commands::query::{self, PAGE_LIMIT},
    project::validation,
};

#[test]
fn paged_clip_query_returns_stable_slices_and_revision() {
    let mut project = crate::fixtures::project();
    let source = project.assets[0].clone();
    let track_id = project.tracks.headers().next().unwrap().id;
    let original = crate::fixtures::clip(&project, 0);
    project.clips = Default::default();
    for index in 0..300u64 {
        let mut clip = (*original).clone();
        clip.id = uuid::Uuid::new_v4();
        clip.start_ms = index * 10;
        clip.duration_ms = 1;
        clip.source_in_ms = 0;
        clip.asset_id = source.id;
        clip.track_id = track_id;
        project.clips.try_push(clip).unwrap();
    }
    let document = beam_editor_domain::Document::new(project);
    let sequence = document.active_sequence;
    let first = query::clips(&document, sequence, 0, PAGE_LIMIT).unwrap();
    let second = query::clips(&document, sequence, first.next.unwrap(), PAGE_LIMIT).unwrap();
    assert_eq!(first.items.len(), PAGE_LIMIT);
    assert_eq!(first.revision, document.revision);
    assert_eq!(first.total, 300);
    assert_eq!(second.items.len(), 44);
    assert!(second.next.is_none());
    assert_ne!(first.items[0].id, second.items[0].id);
    assert!(validation::document(&document).is_ok());
}

#[test]
fn paging_rejects_empty_oversized_and_out_of_range_requests() {
    let values = vec![1, 2, 3];
    assert!(query::page(1, &values, 0, 0).is_err());
    assert!(query::page(1, &values, 0, PAGE_LIMIT + 1).is_err());
    assert!(query::page(1, &values, 4, 1).is_err());
}

#[test]
fn unknown_sequence_and_missing_definition_pages_are_rejected() {
    let document = beam_editor_domain::Document::new(crate::fixtures::project());
    assert!(query::clips(&document, uuid::Uuid::new_v4(), 0, 10).is_err());
    assert!(query::definitions(&document, 1, 1).is_ok());
}
#[test]
fn single_clip_query_returns_shared_decisions_and_preserves_access_errors() {
    let document = beam_editor_domain::Document::new(crate::fixtures::project());
    let id = document.project.clips.headers().next().unwrap().id;
    let clip = query::clip(&document, document.active_sequence, id).unwrap();
    assert!(std::sync::Arc::ptr_eq(
        &clip,
        &document.project.clips.try_by_id(id).unwrap().unwrap()
    ));
    assert!(query::clip(&document, uuid::Uuid::new_v4(), id).is_err());
    assert!(query::clip(&document, document.active_sequence, uuid::Uuid::new_v4()).is_err());
    assert!(query::clips(&document, document.active_sequence, 0, 0).is_err());
    assert!(query::clips(&document, document.active_sequence, 0, PAGE_LIMIT + 1).is_err());
    assert!(query::clips(&document, document.active_sequence, 2, 1).is_err());
}

#[test]
fn preset_pages_keep_versions_and_validate_returned_catalogue_bindings() {
    let mut document = beam_editor_domain::Document::new(crate::fixtures::project());
    let page = query::presets(&document, 0, 1).unwrap();
    assert_eq!(page.items.len(), 1);
    assert_eq!(page.items[0].version, 1);
    assert_eq!(page.next, Some(1));
    assert!(query::presets(&document, 0, 0).is_err());
    document.project.presets[0].parameters.clear();
    assert!(query::presets(&document, 0, 1).is_err());
}

#[test]
fn lazy_clip_queries_validate_payload_bindings_against_the_actual_catalogue() {
    use beam_editor_domain::{
        animation::{Binding, Value},
        collections::PersistentCollection,
        project::{block_types::CollectionIndex, blocks},
    };
    let root = tempfile::tempdir().unwrap();
    let mut project = crate::fixtures::project();
    crate::fixtures::source_identity(&mut project, b"source");
    let instance = project
        .definitions
        .iter()
        .find(|definition| definition.id == "beam.opacity")
        .unwrap()
        .instantiate();
    crate::fixtures::clip_mut(&mut project, 0)
        .instances
        .push(instance);
    let document = beam_editor_domain::Document::new(project);
    let mut index = blocks::index(root.path(), &document).unwrap();
    let mut clip = (*crate::fixtures::clip(&document.project, 0)).clone();
    let id = clip.id;
    clip.instances[0]
        .parameters
        .insert("opacity".into(), Binding::constant(Value::Number(2.)));
    let invalid: PersistentCollection<_> = vec![clip].into();
    let CollectionIndex::Paged(pages) = &mut index.sequences[0].state.clips else {
        panic!("requires paged state")
    };
    pages[0].values = blocks::put(root.path(), &invalid).unwrap();
    let loaded = blocks::load(root.path(), index).unwrap();
    assert_eq!(loaded.project.clips.loaded_pages(), 0);
    assert!(query::clip(&loaded, loaded.active_sequence, id).is_err());
    assert!(query::clips(&loaded, loaded.active_sequence, 0, 1).is_err());
}

#[test]
fn track_overview_pages_do_not_load_fx_and_single_details_validate_their_payload() {
    use beam_editor_domain::{
        Document, Project, Track, TrackKind,
        collections::{LazyPage, PersistentCollection, PersistentItem},
        effects::definition,
    };
    use std::sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    };
    let mut project = Project::new("Tracks".into());
    let mut track = Track::new("Visual lane".into(), TrackKind::Video);
    track.instances.push(
        definition(&project.definitions, "beam.opacity", 2)
            .unwrap()
            .instantiate(),
    );
    let id = track.id;
    let payload = track.clone();
    let count = Arc::new(AtomicUsize::new(0));
    let loads = count.clone();
    project.tracks = PersistentCollection::from_lazy(
        vec![LazyPage {
            hash: "a".repeat(64),
            headers: vec![track.header()],
        }],
        Arc::new(move |_| {
            loads.fetch_add(1, Ordering::SeqCst);
            Ok(Arc::new(vec![Arc::new(payload.clone())]))
        }),
    )
    .unwrap();
    let document = Document::new(project);
    let page = query::tracks(&document, document.active_sequence, 0, 1).unwrap();
    assert_eq!(page.total, 1);
    assert_eq!(page.items[0].effect_count, 1);
    assert_eq!(count.load(Ordering::SeqCst), 0);
    let detail = query::track(&document, document.active_sequence, id).unwrap();
    assert_eq!(*detail, track);
    assert_eq!(count.load(Ordering::SeqCst), 1);
    let again = query::track(&document, document.active_sequence, id).unwrap();
    assert!(Arc::ptr_eq(&detail, &again));
}

#[test]
fn track_queries_reject_unknown_scopes_bad_pages_and_invalid_loaded_bindings() {
    use beam_editor_domain::{
        Document, Project,
        animation::{Binding, Value},
    };
    let mut project = Project::new("Tracks".into());
    let id = project.tracks.headers().next().unwrap().id;
    let mut instance =
        beam_editor_domain::effects::definition(&project.definitions, "beam.opacity", 2)
            .unwrap()
            .instantiate();
    instance
        .parameters
        .insert("opacity".into(), Binding::constant(Value::Number(2.)));
    project
        .tracks
        .try_by_id_mut(id)
        .unwrap()
        .unwrap()
        .instances
        .push(instance);
    let document = Document::new(project);
    assert!(query::tracks(&document, document.active_sequence, 0, 1).is_ok());
    assert!(query::track(&document, document.active_sequence, id).is_err());
    assert!(query::track(&document, document.active_sequence, uuid::Uuid::new_v4()).is_err());
    assert!(query::track(&document, uuid::Uuid::new_v4(), id).is_err());
    for (offset, limit) in [(0, 0), (0, PAGE_LIMIT + 1), (3, 1)] {
        assert!(query::tracks(&document, document.active_sequence, offset, limit).is_err());
    }
    assert!(query::tracks(&document, uuid::Uuid::new_v4(), 0, 1).is_err());
}

#[test]
fn track_overviews_surface_corrupt_header_or_lazy_page_errors() {
    use beam_editor_domain::{
        Document, Project, Track, TrackKind,
        collections::{LazyPage, PersistentCollection, PersistentItem},
        effects::definition,
    };
    use std::sync::Arc;
    let mut project = Project::new("Tracks".into());
    let mut track = Track::new("Lane".into(), TrackKind::Video);
    track.instances.push(
        definition(&project.definitions, "beam.opacity", 2)
            .unwrap()
            .instantiate(),
    );
    let id = track.id;
    project.tracks = PersistentCollection::from_lazy(
        vec![LazyPage {
            hash: "a".repeat(64),
            headers: vec![track.header()],
        }],
        Arc::new(move |_| {
            Err(beam_editor_domain::EditorError::Invalid(
                "unavailable track page".into(),
            ))
        }),
    )
    .unwrap();
    let document = Document::new(project);
    assert!(
        query::track(&document, document.active_sequence, id)
            .unwrap_err()
            .to_string()
            .contains("unavailable track page")
    );
    let mut corrupt = document;
    corrupt
        .project
        .definitions
        .retain(|d| d.id != "beam.opacity");
    assert!(query::tracks(&corrupt, corrupt.active_sequence, 0, 1).is_err());
}

#[test]
fn sequence_inspector_returns_only_a_validated_stack_without_histories_or_clips() {
    use beam_editor_domain::{Document, Project};
    let mut project = Project::new("Sequence".into());
    project.sequence_instances.push(
        beam_editor_domain::effects::definition(&project.definitions, "beam.opacity", 2)
            .unwrap()
            .instantiate(),
    );
    let document = Document::new(project);
    assert_eq!(
        query::sequence_instances(&document, document.active_sequence).unwrap(),
        document.project.sequence_instances
    );
    assert!(query::sequence_instances(&document, uuid::Uuid::new_v4()).is_err());
}

#[test]
fn sequence_inspector_rejects_bad_bindings_and_accepts_an_empty_stack() {
    use beam_editor_domain::{
        Document, Project,
        animation::{Binding, Value},
    };
    let mut project = Project::new("Sequence".into());
    let mut instance =
        beam_editor_domain::effects::definition(&project.definitions, "beam.opacity", 2)
            .unwrap()
            .instantiate();
    instance
        .parameters
        .insert("opacity".into(), Binding::constant(Value::Number(2.)));
    project.sequence_instances.push(instance);
    let document = Document::new(project);
    assert!(query::sequence_instances(&document, document.active_sequence).is_err());
    let empty = Document::new(Project::new("Empty".into()));
    assert!(
        query::sequence_instances(&empty, empty.active_sequence)
            .unwrap()
            .is_empty()
    );
}

#[test]
fn sequence_inspector_rejects_unsupported_definitions_even_when_bindings_are_valid() {
    use beam_editor_domain::{Document, Project};
    let mut project = Project::new("Sequence".into());
    project.sequence_instances.push(
        beam_editor_domain::effects::definition(&project.definitions, "beam.camera.zoom", 1)
            .unwrap()
            .instantiate(),
    );
    let document = Document::new(project);
    assert!(query::sequence_instances(&document, document.active_sequence).is_err());
}

#[test]
fn clip_header_pages_keep_dense_fx_lazy_and_never_embed_bindings() {
    use beam_editor_domain::{
        Document,
        collections::{LazyPage, PersistentCollection, PersistentItem},
        effects::definition,
    };
    use std::sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    };
    let mut project = crate::fixtures::project();
    let mut clip = (*crate::fixtures::clip(&project, 0)).clone();
    let prototype = definition(&project.definitions, "beam.opacity", 1)
        .unwrap()
        .instantiate();
    clip.instances = (0..100).map(|_| prototype.duplicate()).collect();
    let mut pages = Vec::new();
    for page in 0..3 {
        let mut headers = Vec::new();
        for offset in 0..100 {
            let mut header = clip.header();
            header.id = uuid::Uuid::new_v4();
            header.start_ms = (page * 100 + offset) * 10;
            for instance in &mut header.instances {
                instance.id = uuid::Uuid::new_v4();
            }
            headers.push(header);
        }
        pages.push(LazyPage {
            hash: format!("{page:064x}"),
            headers,
        });
    }
    let count = Arc::new(AtomicUsize::new(0));
    let loads = count.clone();
    project.clips = PersistentCollection::from_lazy(
        pages,
        Arc::new(move |_| {
            loads.fetch_add(1, Ordering::SeqCst);
            Err(beam_editor_domain::EditorError::Invalid(
                "FX pages deliberately unavailable".into(),
            ))
        }),
    )
    .unwrap();
    let mut document = Document::new(project);
    document.revision = 9;
    let first = query::clip_headers(&document, document.active_sequence, 0, PAGE_LIMIT).unwrap();
    let last = query::clip_headers(
        &document,
        document.active_sequence,
        first.next.unwrap(),
        PAGE_LIMIT,
    )
    .unwrap();
    assert_eq!(first.revision, 9);
    assert_eq!(first.total, 300);
    assert_eq!(first.items.len(), 256);
    assert_eq!(last.items.len(), 44);
    assert!(last.next.is_none());
    assert_eq!(first.items[0].effect_count, 100);
    assert_eq!(count.load(Ordering::SeqCst), 0);
    assert_eq!(document.project.clips.loaded_pages(), 0);
    let encoded = serde_json::to_value(first).unwrap();
    assert!(encoded["items"][0].get("instances").is_none());
    assert!(encoded["items"][0].get("parameters").is_none());
    assert!(
        serde_json::to_vec(&encoded).unwrap().len() < beam_editor_domain::protocol::MESSAGE_BUDGET
    );
    assert!(
        query::clip_headers(&document, document.active_sequence, 300, 1)
            .unwrap()
            .items
            .is_empty()
    );
    for (offset, limit) in [(0, 0), (0, PAGE_LIMIT + 1), (301, 1)] {
        assert!(query::clip_headers(&document, document.active_sequence, offset, limit).is_err());
    }
    assert!(query::clip_headers(&document, uuid::Uuid::new_v4(), 0, 1).is_err());
    assert!(query::clip(&document, document.active_sequence, last.items[0].id).is_err());
    assert_eq!(count.load(Ordering::SeqCst), 1);
}

#[test]
fn clip_header_queries_reject_invalid_catalogue_metadata_and_time_bounds() {
    for invalid in 0..4 {
        let mut project = crate::fixtures::project();
        let instance =
            beam_editor_domain::effects::definition(&project.definitions, "beam.opacity", 1)
                .unwrap()
                .instantiate();
        let mut clip = crate::fixtures::clip_mut(&mut project, 0);
        clip.instances.push(instance);
        match invalid {
            0 => clip.instances[0].definition_version = 999,
            1 => clip.duration_ms = 0,
            2 => clip.start_ms = u64::MAX,
            _ => clip.rate.numerator = 0,
        }
        drop(clip);
        let document = beam_editor_domain::Document::new(project);
        assert!(query::clip_headers(&document, document.active_sequence, 0, 1).is_err());
    }
}
