#![allow(clippy::expect_used)]

use capture::{
    CaptureError,
    storage::{JsonWrite, read_json, update_json_batch, write_json_atomic, write_json_batch},
};
use serde::{Deserialize, Serialize, Serializer};
use std::{fs, path::Path};

#[derive(Debug, Deserialize, Serialize, PartialEq)]
struct Preferences {
    theme: String,
    enabled: bool,
}

type PreferenceEdit = fn(&mut Preferences) -> Result<(), CaptureError>;

struct InvalidDocument;

impl Serialize for InvalidDocument {
    fn serialize<S: Serializer>(&self, _serializer: S) -> Result<S::Ok, S::Error> {
        Err(serde::ser::Error::custom("invalid document"))
    }
}

fn assert_no_temporaries(directory: &Path) {
    assert!(
        fs::read_dir(directory)
            .expect("read directory")
            .all(|entry| {
                !entry
                    .expect("entry")
                    .file_name()
                    .to_string_lossy()
                    .ends_with(".tmp")
            })
    );
}

#[test]
fn typed_round_trip_creates_parents_and_replaces_a_document() {
    let directory = tempfile::tempdir().expect("directory");
    let path = directory.path().join("nested/preferences.json");
    for enabled in [false, true] {
        let value = Preferences {
            theme: "日本語 · Préférences".into(),
            enabled,
        };
        write_json_atomic(&path, &value).expect("write");
        assert_eq!(read_json::<Preferences>(&path).expect("read"), value);
    }
    assert_no_temporaries(path.parent().expect("parent"));
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        assert_eq!(
            fs::metadata(path).expect("metadata").permissions().mode() & 0o777,
            0o600
        );
    }
}

#[test]
fn generic_documents_support_arrays_and_null() {
    let directory = tempfile::tempdir().expect("directory");
    let path = directory.path().join("value.json");
    for value in [
        serde_json::Value::Null,
        serde_json::json!([1, false, "Beam"]),
    ] {
        write_json_atomic(&path, &value).expect("write");
        assert_eq!(read_json::<serde_json::Value>(&path).expect("read"), value);
    }
}

#[test]
fn invalid_json_and_schema_errors_include_the_document_path() {
    let directory = tempfile::tempdir().expect("directory");
    let path = directory.path().join("preferences.json");
    for source in ["{broken", "{\"theme\":3,\"enabled\":true}", "null"] {
        fs::write(&path, source).expect("source");
        let error = read_json::<Preferences>(&path).expect_err("invalid document");
        assert!(matches!(error, CaptureError::JsonFile { .. }));
        assert!(error.to_string().contains(&path.display().to_string()));
        assert_eq!(error.code(), "serialization-error");
    }
}

#[test]
fn missing_files_and_directories_report_storage_errors() {
    let directory = tempfile::tempdir().expect("directory");
    for path in [
        directory.path().to_path_buf(),
        directory.path().join("missing.json"),
    ] {
        let error = read_json::<Preferences>(&path).expect_err("unreadable document");
        assert!(matches!(error, CaptureError::Storage { .. }));
        assert!(error.to_string().contains(&path.display().to_string()));
    }
}

#[test]
fn serialization_failure_does_not_touch_an_existing_document() {
    let directory = tempfile::tempdir().expect("directory");
    let path = directory.path().join("preferences.json");
    fs::write(&path, b"original").expect("original");
    let error = write_json_atomic(&path, &InvalidDocument).expect_err("serialization failure");
    assert!(matches!(error, CaptureError::JsonFile { .. }));
    assert!(error.to_string().contains("invalid document"));
    assert_eq!(fs::read(&path).expect("original unchanged"), b"original");
    assert_no_temporaries(directory.path());
}

#[test]
fn heterogeneous_batch_deduplicates_destinations_with_the_last_value() {
    let directory = tempfile::tempdir().expect("directory");
    let path = directory.path().join("preferences.json");
    let events = directory.path().join("events.json");
    write_json_batch([
        JsonWrite::new(&path, &false).expect("first"),
        JsonWrite::new(&events, &[1, 2, 3]).expect("events"),
        JsonWrite::new(
            directory.path().join("./preferences.json"),
            &Preferences {
                theme: "dark".into(),
                enabled: true,
            },
        )
        .expect("last"),
    ])
    .expect("batch");
    assert!(
        read_json::<Preferences>(&path)
            .expect("preferences")
            .enabled
    );
    assert_eq!(read_json::<Vec<u32>>(&events).expect("events"), [1, 2, 3]);
    assert_eq!(
        fs::read_dir(directory.path()).expect("directory").count(),
        2
    );
}

#[test]
fn an_empty_batch_does_not_create_any_files() {
    let directory = tempfile::tempdir().expect("directory");
    write_json_batch([]).expect("empty");
    assert_eq!(
        fs::read_dir(directory.path()).expect("directory").count(),
        0
    );
}

#[test]
fn failure_to_prepare_a_parent_preserves_every_original() {
    let directory = tempfile::tempdir().expect("directory");
    let path = directory.path().join("preferences.json");
    let blocker = directory.path().join("blocker");
    fs::write(&path, b"original").expect("original");
    fs::write(&blocker, b"blocker").expect("blocker");
    assert!(
        write_json_batch([
            JsonWrite::new(&path, &true).expect("document"),
            JsonWrite::new(blocker.join("other.json"), &false).expect("second"),
        ])
        .is_err()
    );
    assert_eq!(fs::read(&path).expect("original unchanged"), b"original");
    assert_no_temporaries(directory.path());
}

#[test]
fn failure_to_stage_a_later_file_preserves_every_original() {
    let directory = tempfile::tempdir().expect("directory");
    let path = directory.path().join("preferences.json");
    fs::write(&path, b"original").expect("original");
    assert!(
        write_json_batch([
            JsonWrite::new(&path, &true).expect("document"),
            JsonWrite::new(Path::new("/"), &false).expect("invalid filename"),
        ])
        .is_err()
    );
    assert_eq!(fs::read(&path).expect("original unchanged"), b"original");
    assert_no_temporaries(directory.path());
}

#[test]
fn publication_failure_keeps_published_json_complete_and_cleans_unpublished_temporaries() {
    let directory = tempfile::tempdir().expect("directory");
    let path = directory.path().join("preferences.json");
    let blocked = directory.path().join("directory.json");
    fs::create_dir(&blocked).expect("blocked target");
    assert!(
        write_json_batch([
            JsonWrite::new(&path, &vec![1, 2]).expect("document"),
            JsonWrite::new(&blocked, &false).expect("blocked"),
        ])
        .is_err()
    );
    assert_eq!(
        read_json::<Vec<u32>>(&path).expect("complete published document"),
        [1, 2]
    );
    assert!(blocked.is_dir());
    assert_no_temporaries(directory.path());
}

#[test]
fn unowned_temporary_files_are_never_removed() {
    let directory = tempfile::tempdir().expect("directory");
    let path = directory.path().join("preferences.json");
    let foreign = directory.path().join("preferences.json.tmp");
    fs::write(&foreign, b"foreign").expect("foreign");
    write_json_atomic(&path, &true).expect("write");
    assert_eq!(fs::read(&foreign).expect("foreign unchanged"), b"foreign");
    assert!(read_json::<bool>(&path).expect("written"));
}

#[test]
fn batched_edits_merge_in_memory_and_write_the_final_value() {
    let directory = tempfile::tempdir().expect("directory");
    let path = directory.path().join("preferences.json");
    write_json_atomic(
        &path,
        &Preferences {
            theme: "light".into(),
            enabled: false,
        },
    )
    .expect("initial");
    let edits: [PreferenceEdit; 2] = [
        |value| {
            value.theme = "dark".into();
            Ok(())
        },
        |value| {
            assert_eq!(value.theme, "dark");
            value.enabled = true;
            Ok(())
        },
    ];
    let final_value = update_json_batch(&path, edits).expect("edits");
    assert_eq!(
        final_value,
        Preferences {
            theme: "dark".into(),
            enabled: true
        }
    );
    assert_eq!(
        read_json::<Preferences>(&path).expect("persisted"),
        final_value
    );
    assert_no_temporaries(directory.path());
}

#[test]
fn a_rejected_edit_keeps_the_original_bytes() {
    let directory = tempfile::tempdir().expect("directory");
    let path = directory.path().join("preferences.json");
    let original = b"{\"theme\":\"light\",\"enabled\":false}";
    fs::write(&path, original).expect("initial");
    let edits: [PreferenceEdit; 2] = [
        |value| {
            value.enabled = true;
            Ok(())
        },
        |_| Err(CaptureError::InvalidConfiguration("rejected edit".into())),
    ];
    assert!(update_json_batch(&path, edits).is_err());
    assert_eq!(fs::read(&path).expect("unchanged"), original);
    assert_no_temporaries(directory.path());
}

#[test]
fn an_empty_edit_batch_reads_without_rewriting_or_reformatting() {
    let directory = tempfile::tempdir().expect("directory");
    let path = directory.path().join("preferences.json");
    let original = b"{\"theme\":\"light\",\"enabled\":false}";
    fs::write(&path, original).expect("initial");
    let edits: [PreferenceEdit; 0] = [];
    assert!(
        !update_json_batch(&path, edits)
            .expect("empty edits")
            .enabled
    );
    assert_eq!(fs::read(&path).expect("unchanged"), original);
}

#[test]
fn invalid_input_prevents_edits_from_running() {
    let directory = tempfile::tempdir().expect("directory");
    let path = directory.path().join("preferences.json");
    fs::write(&path, "{broken").expect("initial");
    let mut called = false;
    let result = update_json_batch(
        &path,
        [|_: &mut Preferences| {
            called = true;
            Ok(())
        }],
    );
    assert!(result.is_err());
    assert!(!called);
    assert_eq!(fs::read_to_string(&path).expect("unchanged"), "{broken");
}
