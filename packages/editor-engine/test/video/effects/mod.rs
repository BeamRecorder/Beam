mod batch;
mod batch_shader;
mod batch_types;
mod color_math;
mod framing;
mod generator_external;
mod growth;
mod legacy;
mod processors;
pub(crate) mod shader;
mod state;
mod text_placement;
pub(super) mod types;
mod update;

use beam_editor_domain::{
    animation::{Binding, Value},
    effects::Definition,
};
use beam_editor_engine::{Canvas, Clip, Effects, Project};
use uuid::Uuid;

pub fn project() -> Project {
    let mut project = Project::new("Native instance rendering".into());
    project.canvas = Canvas {
        width: 64,
        height: 64,
        background: 0xff000000,
        ..Canvas::default()
    };
    let mut generator = definition(&project, "beam.solid").instantiate();
    generator.parameters.insert(
        "color".into(),
        Binding::constant(Value::Color([1., 0., 0., 1.])),
    );
    let track_id = project.tracks.headers().next().unwrap().id;
    project
        .clips
        .try_push(Clip {
            id: Uuid::new_v4(),
            asset_id: Uuid::nil(),
            track_id,
            start_ms: 0,
            source_in_ms: 0,
            duration_ms: 1000,
            effects: Effects::default(),
            instances: vec![],
            rate: Default::default(),
            animation_offset_ms: 0,
            generator: Some(generator),
            link_group: None,
            cursor_style: None,
            title: None,
        })
        .unwrap();
    project
}
pub fn definition<'a>(project: &'a Project, id: &str) -> &'a Definition {
    project.definitions.iter().find(|d| d.id == id).unwrap()
}

mod bindings;

mod binding_types;

mod scoped;
