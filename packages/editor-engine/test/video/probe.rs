use beam_editor_engine::video::probe::{discover, import, uri};
#[test]
fn actual_streams_and_duration_are_discovered_from_unicode_and_space_paths() {
    let root = tempfile::tempdir().unwrap();
    let source = crate::fixtures::media(root.path(), "étude space.webm", true);
    let probe = discover(&source).unwrap();
    assert!(probe.has_video && probe.has_audio);
    assert_eq!((probe.width, probe.height), (320, 180));
    assert!(probe.duration_ms > 900 && probe.duration_ms < 1200);
    assert!(uri(&source).unwrap().contains("%20"));
}
#[test]
fn invalid_missing_and_nonmedia_sources_fail_visibly() {
    let root = tempfile::tempdir().unwrap();
    assert!(uri(&root.path().join("missing")).is_err());
    let path = root.path().join("invalid.webm");
    std::fs::write(&path, b"not a video").unwrap();
    assert!(discover(&path).is_err());
}
#[test]
fn import_copies_immutable_bytes_and_rejects_missing_extension() {
    let source = tempfile::tempdir().unwrap();
    let root = tempfile::tempdir().unwrap();
    let path = crate::fixtures::media(source.path(), "clip.webm", false);
    let bytes = std::fs::read(&path).unwrap();
    let asset = import(root.path(), &path).unwrap();
    assert_eq!(std::fs::read(root.path().join(asset.path)).unwrap(), bytes);
    assert_eq!(std::fs::read(&path).unwrap(), bytes);
    assert!(asset.cursor.is_empty());
    let identity = asset.identity.as_ref().unwrap();
    assert_eq!(identity.byte_length, bytes.len() as u64);
    identity.validate().unwrap();
    let bare = source.path().join("bare");
    std::fs::copy(path, &bare).unwrap();
    assert!(import(root.path(), &bare).is_err());
}
#[cfg(unix)]
#[test]
fn media_import_rejects_symlinked_source_and_managed_destination_without_writing_outside() {
    let source = tempfile::tempdir().unwrap();
    let root = tempfile::tempdir().unwrap();
    let outside = tempfile::tempdir().unwrap();
    let path = crate::fixtures::media(source.path(), "actual.webm", false);
    let link = source.path().join("link.webm");
    std::os::unix::fs::symlink(&path, &link).unwrap();
    assert!(import(root.path(), &link).is_err());
    std::os::unix::fs::symlink(outside.path(), root.path().join("media")).unwrap();
    assert!(import(root.path(), &path).is_err());
    assert_eq!(std::fs::read_dir(outside.path()).unwrap().count(), 0);
}
#[test]
fn still_images_keep_dimensions_and_have_a_finite_editable_duration() {
    use gst::prelude::*;
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("still.png");
    gst::init().unwrap();
    let pipeline = gst::parse::launch(&format!("videotestsrc num-buffers=1 ! video/x-raw,width=640,height=360 ! videoconvert ! pngenc ! filesink location=\"{}\"", path.display())).unwrap().downcast::<gst::Pipeline>().unwrap();
    pipeline.set_state(gst::State::Playing).unwrap();
    let message = pipeline
        .bus()
        .unwrap()
        .timed_pop_filtered(
            gst::ClockTime::from_seconds(10),
            &[gst::MessageType::Eos, gst::MessageType::Error],
        )
        .unwrap();
    pipeline.set_state(gst::State::Null).unwrap();
    assert!(matches!(message.view(), gst::MessageView::Eos(..)));
    let probe = discover(&path).unwrap();
    assert!(probe.is_image);
    assert_eq!(
        (probe.width, probe.height, probe.duration_ms),
        (640, 360, 5000)
    );
    let project = tempfile::tempdir().unwrap();
    let asset = import(project.path(), &path).unwrap();
    assert!(asset.is_image);
    assert_eq!(
        std::fs::read(&path).unwrap(),
        std::fs::read(project.path().join(asset.path)).unwrap()
    );
}
