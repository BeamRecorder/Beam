#[test]
fn composed_scope_source_is_a_native_bin_type() {
    use gst::prelude::*;
    gst::init().unwrap();
    assert!(
        beam_editor_engine::video::scope_source_types::ScopeSource::static_type()
            .is_a(gst::Bin::static_type())
    );
}
