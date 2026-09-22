#![cfg(test)]

#[test]
fn mac_screen_facade_exposes_the_platform_capabilities() {
    assert_eq!(super::capabilities(), super::permissions::capabilities());
}
