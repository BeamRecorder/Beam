use beam_editor_domain::{
    effects::{catalog, scope_types::ScopeTarget},
    project::validation,
};

fn scoped() -> beam_editor_domain::effects::Instance {
    catalog::builtins()
        .into_iter()
        .find(|definition| {
            definition.id == "beam.opacity" && definition.targets.contains(&ScopeTarget::Sequence)
        })
        .unwrap()
        .instantiate()
}
#[test]
fn sequence_instances_cannot_collide_with_project_asset_or_clip_header_identities() {
    for collision in 0..3 {
        let mut project = crate::fixtures::project();
        let mut instance = scoped();
        instance.id = match collision {
            0 => project.id,
            1 => project.assets[0].id,
            _ => project.clips.headers().next().unwrap().id,
        };
        project.sequence_instances.push(instance);
        assert!(validation::project(&project).is_err());
    }
}
#[test]
fn track_and_sequence_occurrences_share_a_single_identity_namespace() {
    let mut project = crate::fixtures::project();
    let lane = project.tracks.headers().next().unwrap().id;
    let instance = scoped();
    project
        .tracks
        .try_by_id_mut(lane)
        .unwrap()
        .unwrap()
        .instances
        .push(instance.clone());
    project.sequence_instances.push(instance);
    assert!(validation::project(&project).is_err());
    project.sequence_instances[0].id = uuid::Uuid::new_v4();
    assert!(validation::project(&project).is_ok());
}
#[test]
fn a_track_effect_cannot_reuse_a_clip_instance_or_keyframe_identity() {
    let mut project = crate::fixtures::project();
    let lane = project.tracks.headers().next().unwrap().id;
    let clip = project.clips.headers().next().unwrap().id;
    let instance = scoped();
    project
        .clips
        .try_by_id_mut(clip)
        .unwrap()
        .unwrap()
        .instances
        .push(instance.clone());
    project
        .tracks
        .try_by_id_mut(lane)
        .unwrap()
        .unwrap()
        .instances
        .push(instance);
    assert!(validation::project(&project).is_err());
}
