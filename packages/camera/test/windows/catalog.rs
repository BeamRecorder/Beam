#![cfg(test)]
#![allow(clippy::expect_used)]

use super::*;

#[test]
fn media_foundation_runtime_initializes_without_a_camera() {
    let runtime = MfRuntime::start().expect("Media Foundation runtime");
    drop(runtime);
}

#[test]
fn repeated_media_foundation_runtime_initialization_balances_shutdown() {
    let first = MfRuntime::start().expect("first runtime");
    let second = MfRuntime::start().expect("second runtime");
    drop(second);
    drop(first);
}

#[test]
fn symbolic_link_decoding_preserves_unicode_without_replacement() {
    let units: Vec<u16> = "USB caméra".encode_utf16().collect();
    assert_eq!(
        decode_device_property(&units).expect("valid UTF-16"),
        "USB caméra"
    );
    assert!(decode_device_property(&[0xD800]).is_err());
    assert_eq!(decode_device_property(&[]).expect("empty"), "");
}
