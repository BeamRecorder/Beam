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
