use super::*;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicU64, Ordering};
static NEXT: AtomicU64 = AtomicU64::new(0);

#[derive(Default, Debug, Deserialize, Serialize, PartialEq)]
struct Document {
    count: u64,
    text: String,
}

fn fixture() -> (PathBuf, JsonFile) {
    let root = std::env::temp_dir().join(format!(
        "beam-json-{}-{}",
        std::process::id(),
        NEXT.fetch_add(1, Ordering::Relaxed)
    ));
    let file = JsonFile::new(root.join("document.json"));
    (root, file)
}

#[test]
fn reader_distinguishes_missing_invalid_and_valid_documents() {
    let (root, file) = fixture();
    assert_eq!(file.read::<Document>().unwrap(), None);
    file.write(&Document {
        count: 1,
        text: "Été 🚀".into(),
    })
    .unwrap();
    assert_eq!(file.read::<Document>().unwrap().unwrap().text, "Été 🚀");
    fs::write(file.path(), "{bad").unwrap();
    assert!(
        file.read::<Document>()
            .unwrap_err()
            .contains("document.json")
    );
    assert!(
        file.update::<Document, _>(|doc| {
            doc.count += 1;
            Ok(())
        })
        .is_err()
    );
    assert_eq!(fs::read_to_string(file.path()).unwrap(), "{bad");
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn rejected_patch_and_serializer_leave_the_previous_file_intact() {
    let (root, file) = fixture();
    file.write(&Document::default()).unwrap();
    let before = fs::read(file.path()).unwrap();
    assert!(
        file.update::<Document, ()>(|doc| {
            doc.count = 12;
            Err("rejected".into())
        })
        .is_err()
    );
    struct Invalid;
    impl Serialize for Invalid {
        fn serialize<S: serde::Serializer>(&self, _: S) -> Result<S::Ok, S::Error> {
            Err(serde::ser::Error::custom("rejected"))
        }
    }
    assert!(file.write(&Invalid).is_err());
    assert_eq!(fs::read(file.path()).unwrap(), before);
    assert!(!file.path().with_extension(TEMP_EXTENSION).exists());
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn concurrent_transactions_do_not_lose_updates() {
    let (root, file) = fixture();
    let workers = (0..4)
        .map(|_| {
            let file = file.clone();
            std::thread::spawn(move || {
                for _ in 0..10 {
                    file.update::<Document, _>(|doc| {
                        doc.count += 1;
                        Ok(())
                    })
                    .unwrap();
                }
            })
        })
        .collect::<Vec<_>>();
    for worker in workers {
        worker.join().unwrap();
    }
    assert_eq!(file.read::<Document>().unwrap().unwrap().count, 40);
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn filesystem_errors_and_failed_atomic_replace_are_reported() {
    let (root, file) = fixture();
    fs::create_dir_all(file.path()).unwrap();
    assert!(file.write(&Document::default()).is_err());
    assert!(!file.path().with_extension(TEMP_EXTENSION).exists());
    fs::remove_dir_all(root).unwrap();
    let (root, _) = fixture();
    fs::write(&root, "file").unwrap();
    assert!(
        JsonFile::new(root.join("child.json"))
            .write(&Document::default())
            .is_err()
    );
    fs::remove_file(root).unwrap();
}

#[test]
fn typed_codec_rejects_wrong_shapes_and_round_trips_unicode() {
    let value = Document {
        count: 7,
        text: "Été 🚀".into(),
    };
    assert_eq!(
        parse::<Document>(&stringify(&value).unwrap()).unwrap(),
        value
    );
    assert_eq!(decode::<Document>(encode(&value).unwrap()).unwrap(), value);
    assert!(parse::<Document>("[]").is_err());
    assert!(decode::<Document>(Value::Null).is_err());
    assert_eq!(
        parse::<Value>(&error_response("Échec".into())).unwrap()["error"],
        "Échec"
    );
}
