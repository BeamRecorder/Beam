mod reuse;
mod worker;
use beam_editor_engine::video::visuals::{
    types::{Source, VisualRequest},
    validate,
};
fn source() -> Source {
    let mut asset = crate::fixtures::asset(2_400_000);
    asset.has_audio = true;
    Source {
        project_id: uuid::Uuid::new_v4(),
        root: "/tmp".into(),
        asset,
    }
}
#[test]
fn visible_requests_bound_duration_bin_count_and_available_streams() {
    let source = source();
    for request in [
        VisualRequest::Video {
            position_ms: 2_399_999,
        },
        VisualRequest::Audio {
            start_ms: 300_000,
            end_ms: 310_000,
            step_ms: 16,
        },
    ] {
        validate(&source, &request).unwrap();
    }
    for request in [
        VisualRequest::Video {
            position_ms: 2_400_000,
        },
        VisualRequest::Audio {
            start_ms: 0,
            end_ms: 120_001,
            step_ms: 100,
        },
        VisualRequest::Audio {
            start_ms: 0,
            end_ms: 3000,
            step_ms: 1,
        },
        VisualRequest::Audio {
            start_ms: 0,
            end_ms: 1,
            step_ms: 0,
        },
        VisualRequest::Audio {
            start_ms: 1,
            end_ms: 1,
            step_ms: 1,
        },
    ] {
        assert!(validate(&source, &request).is_err());
    }
    let mut no_stream = source;
    no_stream.asset.has_audio = false;
    no_stream.asset.has_video = false;
    assert!(validate(&no_stream, &VisualRequest::Video { position_ms: 0 }).is_err());
    assert!(
        validate(
            &no_stream,
            &VisualRequest::Audio {
                start_ms: 0,
                end_ms: 1000,
                step_ms: 16
            }
        )
        .is_err()
    );
}

mod bands;
mod types;
