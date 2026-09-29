//! Windowless tests of the actual native selector and its pixel geometry.

use services::{ServiceOutcome, ServiceRegistry};
#[allow(dead_code)]
#[path = "../../src/beam/preferences.rs"]
mod preferences;
#[allow(dead_code)]
#[path = "../../src/beam/teleprompter.rs"]
mod teleprompter;

/// Connects the included selector services to Beam's real preference reader.
mod beam {
    #[allow(dead_code)]
    pub(crate) fn initial_preferences() -> Result<super::preferences::NativePreferences, String> {
        super::json::decode(super::preferences::Preferences::new()?.initialize()?)
    }
}
#[allow(dead_code)]
#[path = "../../src/beam/files.rs"]
mod files;
#[allow(dead_code, unused_imports)]
#[path = "../../src/beam/json.rs"]
mod json;
#[allow(dead_code, unused_imports)]
#[path = "../../src/desktop_application/region.rs"]
mod region;
#[allow(dead_code)]
#[path = "../../src/services.rs"]
mod services;
#[allow(dead_code)]
#[path = "../../src/desktop_application/types.rs"]
mod types;

#[path = "region/pointer.rs"]
mod pointer;

#[path = "region/model.rs"]
mod model;

#[test]
fn projects_window_can_call_registered_services() {
    let registry = std::sync::Arc::new(ServiceRegistry::new());
    registry.register("beam", "listProjects", |_| {
        ServiceOutcome::Ok(serde_json::json!([]))
    });
    let (reply, response) = std::sync::mpsc::channel();
    registry
        .submit(
            1,
            &serde_json::json!({"requestId":1,"window":"projects","service":"beam","method":"listProjects"}).to_string(),
            reply,
        )
        .unwrap();
    let message = response
        .recv_timeout(std::time::Duration::from_secs(2))
        .unwrap();
    assert_eq!(message.window, "projects");
    assert!(matches!(message.outcome, ServiceOutcome::Ok(_)));
}
