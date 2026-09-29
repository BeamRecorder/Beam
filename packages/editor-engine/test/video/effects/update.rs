use super::{definition, project, types::Render};
use beam_editor_domain::animation::{Binding, Value};
use beam_editor_engine::video::pipeline::{prepare_update, update};
use ges::prelude::*;

#[test]
fn prepared_parameters_do_not_publish_until_apply_and_keep_the_native_graph() {
    crate::fixtures::context(|| {
        let root = tempfile::tempdir().unwrap();
        let mut before = project();
        let instance = definition(&before, "beam.opacity").instantiate();
        crate::video::clip_mut(&mut before, 0)
            .instances
            .push(instance);
        let render = Render::new(root.path(), &before);
        let timeline = render.pipeline.timeline().unwrap();
        let nodes: Vec<_> = render
            .pipeline
            .iterate_recurse()
            .into_iter()
            .flatten()
            .map(|e| e.as_ptr() as usize)
            .collect();
        let mut after = before.clone();
        crate::video::clip_mut(&mut after, 0).instances[0]
            .parameters
            .insert("opacity".into(), Binding::constant(Value::Number(0.5)));
        let prepared = prepare_update(&render.pipeline, &before, &after)
            .unwrap()
            .unwrap();
        assert!(render.center(200)[0] > 240);
        prepared.apply();
        assert!((i16::from(render.center(200)[0]) - 128).abs() <= 3);
        assert_eq!(timeline, render.pipeline.timeline().unwrap());
        let updated: Vec<_> = render
            .pipeline
            .iterate_recurse()
            .into_iter()
            .flatten()
            .map(|e| e.as_ptr() as usize)
            .collect();
        assert_eq!(nodes, updated);
        let mut invalid = after.clone();
        invalid.canvas.width = 0;
        assert!(prepare_update(&render.pipeline, &after, &invalid).is_err());
        let instance = definition(&after, "beam.opacity").instantiate();
        crate::video::clip_mut(&mut after, 0)
            .instances
            .push(instance);
        assert!(!update(&render.pipeline, &before, &after).unwrap());
    });
}

#[test]
fn hidden_tracks_remain_hidden_even_when_a_shader_outputs_opaque_pixels() {
    use beam_editor_domain::effects::{Definition, Domain, Processor};
    crate::fixtures::context(|| {
        let root = tempfile::tempdir().unwrap();
        let mut before = project();
        let shader=Definition {targets:beam_editor_domain::effects::scope_types::clip_targets(),id:"demo.opaque".into(),label:"Opaque output".into(),version:1,domain:Domain::Video,timeline_region:false,parameters:vec![],processor:Processor::Shader {fragment:"#ifdef GL_ES\nprecision mediump float;\n#endif\nvarying vec2 v_texcoord;uniform sampler2D tex;void main() {gl_FragColor=vec4(0.0,1.0,0.0,1.0);}".into()}};
        crate::video::clip_mut(&mut before, 0)
            .instances
            .push(shader.instantiate());
        before.definitions.push(shader);
        let render = Render::new(root.path(), &before);
        assert!(render.center(400)[1] > 240);
        let mut hidden = before.clone();
        crate::video::track_mut(&mut hidden, 0).hidden = true;
        let update = prepare_update(&render.pipeline, &before, &hidden)
            .unwrap()
            .unwrap();
        assert!(render.center(400)[1] > 240);
        update.apply();
        assert!(render.center(400)[..3].iter().all(|v| *v < 3));
        prepare_update(&render.pipeline, &hidden, &before)
            .unwrap()
            .unwrap()
            .apply();
        assert!(render.center(400)[1] > 240);
    });
}
