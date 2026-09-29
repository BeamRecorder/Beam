#[path = "../../../../src/screen/linux/portal/restore.rs"]
mod implementation;
use crate::model::PortalSourceKind::{Monitor, MonitorOrWindow, Window};

#[test]
fn portal_grants_are_consumed_once_and_replaced_by_start() {
    assert_eq!(implementation::take(&Monitor), None);
    implementation::remember(&Monitor, "first");
    assert_eq!(implementation::take(&Monitor).as_deref(), Some("first"));
    assert_eq!(implementation::take(&Monitor), None);
    implementation::remember(&Monitor, "second");
    assert_eq!(implementation::take(&Monitor).as_deref(), Some("second"));
}

#[test]
fn portal_monitor_window_and_either_grants_remain_independent() {
    for (kind, token) in [
        (Monitor, "monitor"),
        (Window, "window"),
        (MonitorOrWindow, "either"),
    ] {
        implementation::remember(&kind, token);
    }
    assert_eq!(implementation::take(&Window).as_deref(), Some("window"));
    assert_eq!(implementation::take(&Monitor).as_deref(), Some("monitor"));
    assert_eq!(
        implementation::take(&MonitorOrWindow).as_deref(),
        Some("either")
    );
    assert_eq!(implementation::take(&Window), None);
}

#[test]
fn a_new_portal_token_replaces_an_unused_old_grant_for_only_its_kind() {
    implementation::remember(&Monitor, "old");
    implementation::remember(&Window, "window");
    implementation::remember(&Monitor, "fresh");
    assert_eq!(implementation::take(&Monitor).as_deref(), Some("fresh"));
    assert_eq!(implementation::take(&Window).as_deref(), Some("window"));
}
