use beam_editor_engine::video::types::{AssetView, ProjectView, Transport};
#[test]
fn native_asset_view_excludes_paths_and_cursor_payloads() {
    let mut source = crate::fixtures::asset(1000);
    std::sync::Arc::make_mut(&mut source.cursor).push(crate::fixtures::point(0, 0.5, 0.5, None));
    let json = serde_json::to_value(AssetView::from(&source)).unwrap();
    assert_eq!(json["hasCursor"], true);
    assert!(json.get("path").is_none());
    assert!(json.get("cursor").is_none());
}
#[test]
fn project_view_keeps_edit_metadata_and_warnings() {
    let mut project = crate::fixtures::project();
    project.warnings.push("audio unavailable".into());
    let view = ProjectView::from(&project);
    let expected = project
        .clips
        .headers()
        .map(|clip| {
            beam_editor_domain::protocol::ClipOverview::from_header(clip, &project.definitions)
        })
        .collect::<Vec<_>>();
    assert_eq!(view.clips, expected);
    assert_eq!(view.warnings, project.warnings);
}
#[test]
fn default_transport_is_idle_without_fake_media_or_errors() {
    let transport = serde_json::to_value(Transport::default()).unwrap();
    assert_eq!(transport["durationMs"], 0);
    assert_eq!(transport["playing"], false);
    assert!(transport["error"].is_null());
}

#[test]
fn mailbox_drops_superseded_frames_and_wakes_a_paused_seek() {
    use beam_editor_engine::{PreviewFrame, video::types::FrameMailbox};
    let mailbox = std::sync::Arc::new(FrameMailbox::default());
    assert!(mailbox.wait(std::time::Duration::ZERO).is_err());
    let output = std::sync::Arc::clone(&mailbox);
    let sender = std::thread::spawn(move || {
        output.publish(PreviewFrame {
            sequence: 1,
            position_ms: 0,
            width: 1,
            height: 1,
            rgba: vec![255; 4],
            external: None,
        });
        output.publish(PreviewFrame {
            sequence: 2,
            position_ms: 0,
            width: 1,
            height: 1,
            rgba: vec![255; 4],
            external: None,
        });
    });
    mailbox.wait(std::time::Duration::from_secs(1)).unwrap();
    sender.join().unwrap();
    assert_eq!(mailbox.take().unwrap().sequence, 2);
    assert!(mailbox.take().is_none());
    mailbox.clear();
}

#[test]
fn paused_seek_mailbox_rejects_old_and_future_frames_and_can_resume() {
    use beam_editor_engine::{PreviewFrame, video::types::FrameMailbox};
    let mailbox = FrameMailbox::default();
    let frame = |position_ms| PreviewFrame {
        position_ms,
        sequence: 0,
        width: 1,
        height: 1,
        rgba: vec![255; 4],
        external: None,
    };
    mailbox.expect_position(600, 30);
    for time in [0, 500, 700] {
        mailbox.publish(frame(time));
    }
    assert!(mailbox.wait(std::time::Duration::ZERO).is_err());
    mailbox.publish(frame(600));
    assert_eq!(mailbox.take().unwrap().position_ms, 600);
    mailbox.expect_position(200, 30);
    mailbox.publish(frame(600));
    assert!(mailbox.take().is_none());
    mailbox.publish(frame(200));
    assert_eq!(mailbox.take().unwrap().position_ms, 200);
    mailbox.resume();
    mailbox.publish(frame(900));
    assert_eq!(mailbox.take().unwrap().position_ms, 900);
    mailbox.expect_position(u64::MAX, 0);
    mailbox.publish(frame(u64::MAX));
    assert!(mailbox.take().is_some());
}

#[test]
fn committed_frame_forwarding_wakes_seek_without_retaining_an_extra_raster() {
    use beam_editor_engine::{PreviewFrame, video::types::FrameMailbox};
    use std::sync::Arc;
    let target = Arc::new(FrameMailbox::default());
    let source = FrameMailbox::default();
    source.forward_to(&target);
    source.expect_position(200, 60);
    source.publish(PreviewFrame {
        position_ms: 200,
        sequence: 1,
        width: 1,
        height: 1,
        rgba: vec![255; 4],
        external: None,
    });
    source.wait(std::time::Duration::ZERO).unwrap();
    assert!(source.take().is_none());
    assert_eq!(target.take().unwrap().position_ms, 200);
    drop(target);
    source.resume();
    source.publish(PreviewFrame {
        position_ms: 300,
        sequence: 2,
        width: 1,
        height: 1,
        rgba: vec![255; 4],
        external: None,
    });
    assert_eq!(source.take().unwrap().position_ms, 300);
}
