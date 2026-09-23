use beam_screen::screen::linux::{
    LinuxNativeCapabilities, PortalProperties, evaluate_capabilities,
};

fn portal_properties(
    version: u32,
    monitor: bool,
    window: bool,
    hidden_cursor: bool,
    embedded_cursor: bool,
    metadata_cursor: bool,
) -> PortalProperties {
    PortalProperties {
        version,
        monitor,
        window,
        hidden_cursor,
        embedded_cursor,
        metadata_cursor,
    }
}

fn assert_product_gate(capabilities: &LinuxNativeCapabilities, expected: bool) {
    assert_eq!(capabilities.recording_available, expected);
}

#[test]
fn portal_version_one_disables_portal_capture_even_with_all_features() {
    let capabilities = evaluate_capabilities(
        portal_properties(1, true, true, true, true, true),
        true,
        true,
    );

    assert_eq!(capabilities.backend, "xdg-portal-pipewire");
    assert_eq!(capabilities.portal_version, 1);
    assert!(!capabilities.portal_selection);
    assert!(!capabilities.display_capture);
    assert!(!capabilities.window_capture);
    assert!(!capabilities.separate_cursor);
    assert!(capabilities.hidden_cursor);
    assert!(capabilities.embedded_cursor);
    assert!(!capabilities.cursor_shapes);
    assert!(capabilities.pipewire_available);
    assert_product_gate(&capabilities, false);
}

#[test]
fn portal_version_two_is_the_minimum_supported_version() {
    let capabilities = evaluate_capabilities(
        portal_properties(2, true, true, true, true, true),
        true,
        true,
    );

    assert_eq!(capabilities.portal_version, 2);
    assert!(capabilities.portal_selection);
    assert!(capabilities.display_capture);
    assert!(capabilities.window_capture);
    assert!(capabilities.separate_cursor);
    assert_product_gate(&capabilities, true);
}

#[test]
fn portal_versions_above_two_keep_the_same_contract() {
    for version in [3, 5, 42] {
        let capabilities = evaluate_capabilities(
            portal_properties(version, true, true, false, true, true),
            true,
            true,
        );

        assert_eq!(capabilities.portal_version, version);
        assert!(capabilities.portal_selection);
        assert!(capabilities.display_capture);
        assert!(capabilities.window_capture);
        assert!(!capabilities.hidden_cursor);
        assert!(capabilities.embedded_cursor);
        assert!(capabilities.separate_cursor);
        assert_product_gate(&capabilities, true);
    }
}

#[test]
fn monitor_only_source_supports_display_but_not_window_capture() {
    let capabilities = evaluate_capabilities(
        portal_properties(5, true, false, true, false, true),
        true,
        true,
    );

    assert!(capabilities.portal_selection);
    assert!(capabilities.display_capture);
    assert!(!capabilities.window_capture);
    assert!(capabilities.hidden_cursor);
    assert!(!capabilities.embedded_cursor);
    assert!(capabilities.separate_cursor);
    assert_product_gate(&capabilities, true);
}

#[test]
fn window_only_source_supports_window_but_not_display_capture() {
    let capabilities = evaluate_capabilities(
        portal_properties(5, false, true, false, true, true),
        true,
        true,
    );

    assert!(capabilities.portal_selection);
    assert!(!capabilities.display_capture);
    assert!(capabilities.window_capture);
    assert!(!capabilities.hidden_cursor);
    assert!(capabilities.embedded_cursor);
    assert!(capabilities.separate_cursor);
    assert_product_gate(&capabilities, true);
}

#[test]
fn missing_source_types_disable_portal_selection() {
    let capabilities = evaluate_capabilities(
        portal_properties(5, false, false, true, true, true),
        true,
        true,
    );

    assert!(!capabilities.portal_selection);
    assert!(!capabilities.display_capture);
    assert!(!capabilities.window_capture);
    assert!(!capabilities.separate_cursor);
    assert!(capabilities.hidden_cursor);
    assert!(capabilities.embedded_cursor);
    assert_product_gate(&capabilities, false);
}

#[test]
fn unavailable_pipewire_disables_all_capture_paths() {
    let capabilities = evaluate_capabilities(
        portal_properties(5, true, true, true, true, true),
        false,
        true,
    );

    assert!(!capabilities.pipewire_available);
    assert!(!capabilities.portal_selection);
    assert!(!capabilities.display_capture);
    assert!(!capabilities.window_capture);
    assert!(!capabilities.separate_cursor);
    assert!(capabilities.hidden_cursor);
    assert!(capabilities.embedded_cursor);
    assert_product_gate(&capabilities, false);
}

#[test]
fn unavailable_encoder_keeps_portal_selection_but_closes_recording_gate() {
    let capabilities = evaluate_capabilities(
        portal_properties(5, true, true, true, true, true),
        true,
        false,
    );

    assert!(capabilities.pipewire_available);
    assert!(capabilities.portal_selection);
    assert!(capabilities.display_capture);
    assert!(capabilities.window_capture);
    assert_product_gate(&capabilities, false);
}

#[test]
fn cursor_modes_are_reported_independently_and_metadata_is_required_for_separate_cursor() {
    let no_metadata = evaluate_capabilities(
        portal_properties(5, true, true, true, true, false),
        true,
        true,
    );
    assert!(no_metadata.portal_selection);
    assert!(no_metadata.hidden_cursor);
    assert!(no_metadata.embedded_cursor);
    assert!(!no_metadata.separate_cursor);
    assert!(!no_metadata.cursor_shapes);
    assert_product_gate(&no_metadata, true);

    let metadata_only = evaluate_capabilities(
        portal_properties(5, true, true, false, false, true),
        true,
        true,
    );
    assert!(metadata_only.portal_selection);
    assert!(!metadata_only.hidden_cursor);
    assert!(!metadata_only.embedded_cursor);
    assert!(metadata_only.separate_cursor);
    assert!(metadata_only.cursor_shapes);
    assert_product_gate(&metadata_only, true);
}
