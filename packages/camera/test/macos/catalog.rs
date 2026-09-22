#![cfg(test)]
#![allow(clippy::expect_used)]

use super::*;

#[test]
fn macos_video_media_type_is_available() {
    assert!(video_media_type().is_ok());
}
