use crate::fixtures::decision;
use beam_editor_domain::recording::style_types::{
    CursorStyle, CursorStyleOverride, RecordingStyle,
};

#[test]
fn partial_overrides_follow_future_sequence_changes_without_copying_values() {
    let mut base = CursorStyle::default();
    let overrides = CursorStyleOverride {
        size: Some(42.),
        ..Default::default()
    };
    let first = base.overridden(Some(&overrides));
    base.color = [0.2, 0.3, 0.4, 1.];
    let second = base.overridden(Some(&overrides));
    assert_eq!(first.size, 42.);
    assert_eq!(second.size, 42.);
    assert_eq!(second.color, base.color);
    assert_ne!(first.color, second.color);
    assert_eq!(base.overridden(None), base);
}
#[test]
fn profile_validation_rejects_nonfinite_and_out_of_range_pixels_colors_and_times() {
    for style in [
        CursorStyle {
            size: f64::NAN,
            ..Default::default()
        },
        CursorStyle {
            size: 0.,
            ..Default::default()
        },
        CursorStyle {
            color: [1.2; 4],
            ..Default::default()
        },
        CursorStyle {
            smoothing_ms: 1001,
            ..Default::default()
        },
        CursorStyle {
            hide_after_ms: 60_001,
            ..Default::default()
        },
    ] {
        assert!(style.validate().is_err());
    }
    assert!(
        CursorStyle {
            size: 256.,
            smoothing_ms: 1000,
            hide_after_ms: 60_000,
            ..Default::default()
        }
        .validate()
        .is_ok()
    );
}
#[test]
fn versioned_recording_profile_rejects_unknown_versions_and_invalid_zoom_defaults() {
    assert!(RecordingStyle::default().validate().is_ok());
    assert!(
        RecordingStyle {
            version: 2,
            ..Default::default()
        }
        .validate()
        .is_err()
    );
    let mut style = RecordingStyle::default();
    style.zoom.scale = f64::INFINITY;
    assert!(style.validate().is_err());
    style.zoom.scale = 5.;
    style.zoom.exit_ms = 10_001;
    assert!(style.validate().is_err());
}

#[test]
fn sequence_style_and_clip_overrides_restore_independently_after_reopening() {
    use beam_editor_domain::{Document, Edit, project::store::ProjectStore, timeline::history};
    let mut project = crate::fixtures::project();
    project.assets[0].cursor_mode =
        beam_editor_domain::recording::style_types::CursorMode::Separated;
    project.assets[0].cursor = vec![crate::fixtures::point(0, 0.5, 0.5, None)].into();
    crate::fixtures::source_identity(&mut project, b"captured media fixture");
    let original = Document::new(project);
    let clip_id = decision(&original.project.clips, 0).id;
    let mut style = original.project.recording_style.clone();
    style.cursor.size = 42.;
    let profile = history::edited(&original, &Edit::RecordingStyle { style }).unwrap();
    let overridden = history::edited(
        &profile,
        &Edit::CursorStyle {
            id: clip_id,
            style: Some(CursorStyleOverride {
                color: Some([0., 1., 0., 1.]),
                ..Default::default()
            }),
        },
    )
    .unwrap();
    let root = tempfile::tempdir().unwrap();
    let store = ProjectStore::lock(root.path()).unwrap();
    store.write(&overridden).unwrap();
    let reopened = store.read().unwrap().0;
    assert_eq!(reopened, overridden);
    let undo = history::edited(&reopened, &Edit::Undo {}).unwrap();
    assert_eq!(undo.project.recording_style.cursor.size, 42.);
    assert!(decision(&undo.project.clips, 0).cursor_style.is_none());
    let undo_profile = history::edited(&undo, &Edit::Undo {}).unwrap();
    assert_eq!(
        undo_profile.project.recording_style,
        original.project.recording_style
    );
    let redo = history::edited(&undo_profile, &Edit::Redo {}).unwrap();
    assert_eq!(redo.project.recording_style.cursor.size, 42.);
    assert_eq!(redo.project.assets, original.project.assets);
}
