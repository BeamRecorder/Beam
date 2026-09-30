use beam_editor_engine::video::recording_effects::cursor_catalog;
#[test]
fn public_catalogue_summaries_preserve_roles_without_exposing_filesystem_resources() {
    let value = serde_json::to_value(cursor_catalog::summaries().unwrap()).unwrap();
    for pack in value.as_array().unwrap() {
        assert!(pack["id"].is_string());
        for art in pack["cursors"].as_array().unwrap() {
            assert!(art["id"].is_string());
            assert!(art["tintable"].is_boolean());
            assert_eq!(art.as_object().unwrap().len(), 3);
        }
    }
}
