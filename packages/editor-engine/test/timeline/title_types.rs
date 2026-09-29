use beam_editor_engine::{
    Document, Edit, Effects, Project, TrackKind,
    timeline::{edit::apply, history::edited, title_types::Title},
};

#[test]
fn generated_titles_are_persisted_and_undoable_without_fake_assets() {
    let project = Project::new("Titles".into());
    let title = Title {
        text: "Hello <Beam> & friends".into(),
        ..Title::default()
    };
    let document = edited(
        &Document::new(project),
        &Edit::InsertTitle {
            title: title.clone(),
            start_ms: 1000,
        },
    )
    .unwrap();
    assert!(document.project.assets.is_empty());
    assert_eq!(
        crate::fixtures::clip(&document.project, 0).title,
        Some(title)
    );
    assert_eq!(crate::fixtures::clip(&document.project, 0).start_ms, 1000);
    let decoded: Document =
        serde_json::from_slice(&serde_json::to_vec(&document).unwrap()).unwrap();
    assert_eq!(decoded.project.clips, document.project.clips);
    assert!(
        edited(&decoded, &Edit::Undo {})
            .unwrap()
            .project
            .clips
            .is_empty()
    );
}
#[test]
fn title_validation_rejects_blank_markup_nul_invalid_fonts_and_nonvideo_tracks() {
    let project = Project::new("Titles".into());
    for title in [
        Title {
            text: " ".into(),
            ..Title::default()
        },
        Title {
            text: "\0".into(),
            ..Title::default()
        },
        Title {
            font: "".into(),
            ..Title::default()
        },
        Title {
            size: f64::NAN,
            ..Title::default()
        },
        Title {
            text: "x".repeat(4097),
            ..Title::default()
        },
    ] {
        assert!(apply(&project, &Edit::InsertTitle { title, start_ms: 0 }).is_err());
    }
    let valid = apply(
        &project,
        &Edit::InsertTitle {
            title: Title::default(),
            start_ms: 0,
        },
    )
    .unwrap();
    let audio = valid
        .tracks
        .headers()
        .find(|track| track.kind == TrackKind::Audio)
        .unwrap();
    assert!(
        apply(
            &valid,
            &Edit::Move {
                id: crate::fixtures::clip(&valid, 0).id,
                track_id: audio.id,
                start_ms: 0
            }
        )
        .is_err()
    );
    let ordinary = crate::fixtures::project();
    assert!(
        apply(
            &ordinary,
            &Edit::Title {
                id: crate::fixtures::clip(&ordinary, 0).id,
                title: Title::default()
            }
        )
        .is_err()
    );
}
#[test]
fn split_and_trim_keep_outer_fades_within_the_resulting_clip_boundaries() {
    let mut project = crate::fixtures::project();
    crate::fixtures::clip_mut(&mut project, 0).effects = Effects {
        fade_in_ms: 4000,
        fade_out_ms: 4000,
        ..Effects::default()
    };
    let id = crate::fixtures::clip(&project, 0).id;
    let split = apply(&project, &Edit::Split { id, time_ms: 1000 }).unwrap();
    assert_eq!(
        (
            crate::fixtures::clip(&split, 0).effects.fade_in_ms,
            crate::fixtures::clip(&split, 0).effects.fade_out_ms
        ),
        (1000, 0)
    );
    assert_eq!(
        (
            crate::fixtures::clip(&split, 1).effects.fade_in_ms,
            crate::fixtures::clip(&split, 1).effects.fade_out_ms
        ),
        (0, 4000)
    );
    let trimmed = apply(
        &project,
        &Edit::Trim {
            id,
            source_in_ms: 0,
            start_ms: 0,
            duration_ms: 500,
        },
    )
    .unwrap();
    assert_eq!(
        (
            crate::fixtures::clip(&trimmed, 0).effects.fade_in_ms,
            crate::fixtures::clip(&trimmed, 0).effects.fade_out_ms
        ),
        (250, 250)
    );
    assert!(
        apply(
            &project,
            &Edit::Effects {
                id,
                effects: Effects {
                    fade_in_ms: 6000,
                    fade_out_ms: 6000,
                    ..Effects::default()
                }
            }
        )
        .is_err()
    );
}
#[test]
fn old_documents_load_zero_fades_and_no_generated_title() {
    let project = crate::fixtures::project();
    let mut json = serde_json::to_value(&project).unwrap();
    let clip = json["clips"][0].as_object_mut().unwrap();
    clip.remove("title");
    let effects = clip.get_mut("effects").unwrap().as_object_mut().unwrap();
    effects.remove("fadeInMs");
    effects.remove("fadeOutMs");
    let decoded: Project = serde_json::from_value(json).unwrap();
    assert!(crate::fixtures::clip(&decoded, 0).title.is_none());
    assert_eq!(crate::fixtures::clip(&decoded, 0).effects.fade_in_ms, 0);
}
