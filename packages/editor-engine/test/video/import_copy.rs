use beam_editor_engine::{EditorError, video::probe::import_cancellable};
use std::sync::atomic::{AtomicBool, Ordering};

#[test]
fn copied_media_identity_describes_the_managed_bytes_and_preserves_the_original() {
    let source = tempfile::tempdir().unwrap();
    let root = tempfile::tempdir().unwrap();
    let path = crate::fixtures::media(source.path(), "actual.webm", false);
    let original = std::fs::read(&path).unwrap();
    let mut copied = 0;
    let asset = import_cancellable(
        root.path(),
        &path,
        &AtomicBool::new(false),
        |bytes, total| {
            assert!(bytes <= total);
            copied = bytes;
            Ok(())
        },
    )
    .unwrap();
    assert_eq!(copied, original.len() as u64);
    assert_eq!(std::fs::read(&path).unwrap(), original);
    assert_eq!(
        std::fs::read(root.path().join(&asset.path)).unwrap(),
        original
    );
    let version =
        beam_editor_engine::service::artifacts::version(&root.path().join(asset.path)).unwrap();
    assert_eq!(asset.identity.unwrap().sha256, version.sha256);
}

#[test]
fn cancellation_before_or_during_copy_leaves_no_published_media() {
    for initially_cancelled in [true, false] {
        let source = tempfile::tempdir().unwrap();
        let root = tempfile::tempdir().unwrap();
        let path = source.path().join("bytes.webm");
        std::fs::write(&path, vec![7u8; 512 * 1024]).unwrap();
        let cancel = AtomicBool::new(initially_cancelled);
        let mut callbacks = 0;
        let error = import_cancellable(root.path(), &path, &cancel, |_, _| {
            callbacks += 1;
            cancel.store(true, Ordering::Release);
            Ok(())
        })
        .unwrap_err();
        assert!(matches!(error, EditorError::Stopped));
        assert_eq!(callbacks, usize::from(!initially_cancelled));
        assert_eq!(
            std::fs::read_dir(root.path().join("media"))
                .unwrap()
                .count(),
            0
        );
        assert_eq!(std::fs::metadata(path).unwrap().len(), 512 * 1024);
    }
}

#[test]
fn replaced_source_and_failed_progress_do_not_publish_a_candidate() {
    for replace in [true, false] {
        let source = tempfile::tempdir().unwrap();
        let root = tempfile::tempdir().unwrap();
        let path = source.path().join("bytes.webm");
        std::fs::write(&path, vec![7u8; 512 * 1024]).unwrap();
        let mut changed = false;
        let result = import_cancellable(root.path(), &path, &AtomicBool::new(false), |_, _| {
            if !replace {
                return Err(EditorError::Invalid("job metadata storage failed".into()));
            }
            if !changed {
                changed = true;
                let replacement = source.path().join("replacement");
                std::fs::write(&replacement, vec![9u8; 512 * 1024]).unwrap();
                std::fs::rename(replacement, &path).unwrap();
            }
            Ok(())
        });
        let error = result.unwrap_err().to_string();
        assert!(
            error.contains(if replace {
                "changed while"
            } else {
                "metadata storage failed"
            }),
            "{error}"
        );
        assert_eq!(
            std::fs::read_dir(root.path().join("media"))
                .unwrap()
                .count(),
            0
        );
    }
}
