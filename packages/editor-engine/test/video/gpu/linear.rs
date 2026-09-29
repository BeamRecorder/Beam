//! The hardware encoder bridge preserves timing and rejects incompatible input.
#[cfg(target_os = "linux")]
#[test]
fn linear_dmabuf_caps_preserve_timing_dimensions_and_change_only_the_memory_contract() {
    use beam_editor_engine::video::gpu::linear::caps;
    gst::init().unwrap();
    let external="video/x-raw(memory:GLMemory),format=NV12,texture-target=2D,width=320,height=180,framerate=30/1".parse::<gst::Caps>().unwrap();
    let raw = caps(gst::PadDirection::Sink, &external);
    assert_eq!(
        raw.structure(0).unwrap().get::<String>("format").unwrap(),
        "NV12"
    );
    assert!(
        raw.structure(0)
            .unwrap()
            .get::<String>("texture-target")
            .is_err()
    );
    assert_eq!(raw.structure(0).unwrap().get::<i32>("width").unwrap(), 320);
    assert_eq!(
        raw.structure(0)
            .unwrap()
            .get::<gst::Fraction>("framerate")
            .unwrap(),
        gst::Fraction::new(30, 1)
    );
    assert!(!raw.features(0).unwrap().contains("memory:GLMemory"));
    assert_eq!(caps(gst::PadDirection::Src, &raw), external);
    assert!(caps(gst::PadDirection::Sink, &gst::Caps::new_empty()).is_empty());
    assert!(caps(gst::PadDirection::Src, &gst::Caps::new_empty()).is_empty());
}
#[cfg(target_os = "linux")]
#[test]
fn gpu_encoder_bridge_rejects_non_nv12_missing_planes_and_host_memory() {
    use beam_editor_engine::video::gpu::linear::export;
    gst::init().unwrap();
    let nv12 = gst_video::VideoInfo::builder(gst_video::VideoFormat::Nv12, 320, 180)
        .build()
        .unwrap();
    let rgba = gst_video::VideoInfo::builder(gst_video::VideoFormat::Rgba, 320, 180)
        .build()
        .unwrap();
    let mut input = gst::Buffer::new();
    assert!(export(&input, &rgba).is_err());
    assert!(export(&input, &nv12).is_err());
    input
        .get_mut()
        .unwrap()
        .append_memory(gst::Memory::from_mut_slice(vec![0; 320 * 180]));
    assert!(export(&input, &nv12).is_err());
    input
        .get_mut()
        .unwrap()
        .append_memory(gst::Memory::from_mut_slice(vec![0; 320 * 90]));
    assert!(
        export(&input, &nv12)
            .unwrap_err()
            .to_string()
            .contains("not GL memory")
    );
}
