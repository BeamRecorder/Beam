use std::any::TypeId;

use beam_media_manifest::{
    ProjectManifest as SharedProjectManifest, SessionManifest as SharedSessionManifest,
};
use capture::model::{ProjectManifest, SCHEMA_VERSION, SessionManifest};

#[test]
fn legacy_capture_manifest_types_keep_the_v2_shared_schema() {
    assert_eq!(SCHEMA_VERSION, 2);
    assert_eq!(
        TypeId::of::<ProjectManifest>(),
        TypeId::of::<SharedProjectManifest>()
    );
    assert_eq!(
        TypeId::of::<SessionManifest>(),
        TypeId::of::<SharedSessionManifest>()
    );
}
