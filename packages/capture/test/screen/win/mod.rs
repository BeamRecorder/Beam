#![cfg(test)]

#[test]
fn windows_screen_facade_exposes_the_platform_capabilities() {
    assert_eq!(super::capabilities(), super::permissions::capabilities());
}
