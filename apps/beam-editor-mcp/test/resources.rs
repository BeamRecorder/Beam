use beam_editor_domain::protocol::Request;
use beam_editor_mcp::resources;
#[test]
fn resource_catalog_and_templates_expose_only_opaque_ids() {
    assert_eq!(resources::list()["resources"].as_array().unwrap().len(), 4);
    assert_eq!(
        resources::templates()["resourceTemplates"]
            .as_array()
            .unwrap()
            .len(),
        2
    );
    for uri in [
        "beam://project",
        "beam://definitions",
        "beam://jobs",
        "beam://artifacts",
    ] {
        assert!(resources::request(uri).is_some());
    }
    let id = "00000000-0000-4000-8000-000000000001";
    assert!(
        matches!(resources::request(&format!("beam://jobs/{id}")),Some(Request::JobGet {id:actual}) if actual.to_string()==id)
    );
    assert!(matches!(
        resources::request(&format!("beam://artifacts/{id}?offset=4&length=8")),
        Some(Request::ArtifactRead {
            offset: 4,
            length: 8,
            ..
        })
    ));
    assert!(matches!(
        resources::request(&format!("beam://artifacts/{id}")),
        Some(Request::ArtifactRead {
            offset: 0,
            length: 262144,
            ..
        })
    ));
    for tail in [
        "?length=0",
        "?length=262145",
        "?offset=-1",
        "?length=x",
        "?offset=0&offset=1",
        "?length=1&length=2",
        "?unexpected=1",
        "?offset",
        "/file",
    ] {
        assert!(
            resources::request(&format!("beam://artifacts/{id}{tail}")).is_none(),
            "{tail}"
        );
    }
    for uri in [
        "file:///etc/passwd",
        "beam://jobs/no-id",
        "beam://artifacts/no-id",
    ] {
        assert!(resources::request(uri).is_none());
    }
}
