use crate::CameraFormat;

pub(super) struct OwnedSample {
    pub format: CameraFormat,
    pub native_timestamp_ns: Option<u64>,
    pub sequence: u64,
    pub bytes: Vec<u8>,
}

#[path = "../../test/macos/types.rs"]
mod types_checks;
