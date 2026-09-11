#![allow(clippy::expect_used)]

use super::*;
use windows::Win32::UI::HiDpi::{
    AreDpiAwarenessContextsEqual, DPI_AWARENESS_CONTEXT_UNAWARE, GetThreadDpiAwarenessContext,
};

fn context() -> DPI_AWARENESS_CONTEXT {
    // SAFETY: querying the current thread context requires no caller-owned storage.
    unsafe { GetThreadDpiAwarenessContext() }
}

fn assert_context(expected: DPI_AWARENESS_CONTEXT) {
    // SAFETY: both contexts are valid predefined or queried context handles.
    assert!(unsafe { AreDpiAwarenessContextsEqual(context(), expected) }.as_bool());
}

#[test]
fn physical_coordinates_restore_the_callers_context() {
    let original = context();
    {
        let _scope = PhysicalCoordinates::enter().expect("physical coordinates");
        assert_context(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
    }
    assert_context(original);
}

#[test]
fn nested_coordinate_queries_preserve_the_outer_context() {
    let original = context();
    let outer = PhysicalCoordinates::enter().expect("outer scope");
    {
        let _inner = PhysicalCoordinates::enter().expect("inner scope");
        assert_context(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
    }
    assert_context(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
    drop(outer);
    assert_context(original);
}

#[test]
fn failed_source_lookup_restores_an_unaware_callers_context() {
    // SAFETY: this is a supported predefined context; the guard restores it on exit.
    let original = unsafe { SetThreadDpiAwarenessContext(DPI_AWARENESS_CONTEXT_UNAWARE) };
    assert!(!original.0.is_null());
    let _restore = PhysicalCoordinates { previous: original };
    let result = crate::cursor::win::source_region(
        &crate::model::SourceId::new("invalid").expect("source id"),
    );
    assert!(result.is_err());
    assert_context(DPI_AWARENESS_CONTEXT_UNAWARE);
}
