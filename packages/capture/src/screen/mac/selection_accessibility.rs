use core_graphics::geometry::{CGPoint, CGSize};
use std::{
    ffi::{CStr, c_char, c_void},
    ptr,
};

use crate::screen::SelectionBounds;

type CfRef = *const c_void;
const UTF8: u32 = 0x0800_0100;

#[link(name = "ApplicationServices", kind = "framework")]
unsafe extern "C" {
    fn AXIsProcessTrusted() -> bool;
    fn AXUIElementCreateApplication(pid: i32) -> CfRef;
    fn AXUIElementCopyAttributeValue(element: CfRef, attribute: CfRef, result: *mut CfRef) -> i32;
    fn AXUIElementPerformAction(element: CfRef, action: CfRef) -> i32;
    fn AXUIElementSetMessagingTimeout(element: CfRef, seconds: f32) -> i32;
    fn AXValueGetValue(value: CfRef, kind: u32, result: *mut c_void) -> bool;
    fn AXValueGetTypeID() -> usize;
    fn AXUIElementGetTypeID() -> usize;
}

#[link(name = "CoreFoundation", kind = "framework")]
unsafe extern "C" {
    fn CFRelease(value: CfRef);
    fn CFGetTypeID(value: CfRef) -> usize;
    fn CFArrayGetTypeID() -> usize;
    fn CFArrayGetCount(array: CfRef) -> isize;
    fn CFArrayGetValueAtIndex(array: CfRef, index: isize) -> CfRef;
    fn CFStringGetTypeID() -> usize;
    fn CFStringCreateWithCString(allocator: CfRef, value: *const c_char, encoding: u32) -> CfRef;
    fn CFStringGetCString(value: CfRef, buffer: *mut c_char, size: isize, encoding: u32) -> bool;
}

struct OwnedCf(CfRef);
impl Drop for OwnedCf {
    fn drop(&mut self) {
        // SAFETY: only non-null objects returned by a CF create/copy operation are owned.
        unsafe { CFRelease(self.0) };
    }
}

fn attribute(element: CfRef, name: &CStr) -> Result<OwnedCf, String> {
    // SAFETY: attribute names are static NUL-terminated strings; AX element lifetimes
    // remain owned by the application or its copied window array throughout the call.
    let key = unsafe { CFStringCreateWithCString(ptr::null(), name.as_ptr(), UTF8) };
    if key.is_null() {
        return Err("Could not allocate an accessibility attribute".into());
    }
    let key = OwnedCf(key);
    let mut result = ptr::null();
    let code = unsafe { AXUIElementCopyAttributeValue(element, key.0, &raw mut result) };
    if code != 0 || result.is_null() {
        return Err(format!(
            "Could not read a window accessibility attribute ({code})"
        ));
    }
    Ok(OwnedCf(result))
}

fn matches_window(element: CfRef, bounds: &SelectionBounds, title: &str) -> bool {
    let Ok(label) = attribute(element, c"AXTitle") else {
        return false;
    };
    // SAFETY: inspect the CF type before reading the UTF-8 string into bounded storage.
    if unsafe { CFGetTypeID(label.0) != CFStringGetTypeID() } {
        return false;
    }
    let mut text = [0 as c_char; 4096];
    if !unsafe { CFStringGetCString(label.0, text.as_mut_ptr(), text.len() as isize, UTF8) } {
        return false;
    }
    // SAFETY: CFStringGetCString succeeded and wrote a NUL-terminated string.
    if unsafe { CStr::from_ptr(text.as_ptr()) }.to_string_lossy() != title {
        return false;
    }
    let (Ok(position), Ok(size)) = (
        attribute(element, c"AXPosition"),
        attribute(element, c"AXSize"),
    ) else {
        return false;
    };
    let mut point = CGPoint::new(0.0, 0.0);
    let mut dimensions = CGSize::new(0.0, 0.0);
    // Accessibility responses are external CF objects: validate before casting.
    if unsafe {
        CFGetTypeID(position.0) != AXValueGetTypeID() || CFGetTypeID(size.0) != AXValueGetTypeID()
    } {
        return false;
    }
    // SAFETY: typed AX values copy into matching CG structures.
    if !unsafe {
        AXValueGetValue(position.0, 1, (&raw mut point).cast())
            && AXValueGetValue(size.0, 2, (&raw mut dimensions).cast())
    } {
        return false;
    }
    (point.x - f64::from(bounds.x)).abs() <= 2.0
        && (point.y - f64::from(bounds.y)).abs() <= 2.0
        && (dimensions.width - f64::from(bounds.width)).abs() <= 2.0
        && (dimensions.height - f64::from(bounds.height)).abs() <= 2.0
}

pub(super) fn raise_window(pid: i32, bounds: &SelectionBounds, title: &str) -> Result<(), String> {
    // AXRaise raises exactly one window without activating its application or
    // stealing keyboard focus from the native source chooser. Never guess when
    // two accessible windows share the same title and geometry.
    if !unsafe { AXIsProcessTrusted() } {
        return Err("Enable Accessibility access for Beam to bring windows forward. The live preview remains available.".into());
    }
    let app = unsafe { AXUIElementCreateApplication(pid) };
    if app.is_null() {
        return Err("The window's application is unavailable".into());
    }
    let app = OwnedCf(app);
    let code = unsafe { AXUIElementSetMessagingTimeout(app.0, 0.1) };
    if code != 0 {
        return Err(format!(
            "Could not bound window accessibility requests ({code})"
        ));
    }
    let windows = attribute(app.0, c"AXWindows")?;
    if unsafe { CFGetTypeID(windows.0) != CFArrayGetTypeID() } {
        return Err("The application returned invalid accessible windows".into());
    }
    let count = unsafe { CFArrayGetCount(windows.0) };
    let mut matching = None;
    for index in 0..count.min(64) {
        let element = unsafe { CFArrayGetValueAtIndex(windows.0, index) };
        if element.is_null()
            || unsafe { CFGetTypeID(element) != AXUIElementGetTypeID() }
            || !matches_window(element, bounds, title)
        {
            continue;
        }
        if matching.is_some() {
            return Err("The selected window could not be identified unambiguously".into());
        }
        matching = Some(element);
    }
    let element = matching.ok_or("The selected window is not accessible")?;
    let action = unsafe { CFStringCreateWithCString(ptr::null(), c"AXRaise".as_ptr(), UTF8) };
    if action.is_null() {
        return Err("Could not allocate the window raise action".into());
    }
    let action = OwnedCf(action);
    let code = unsafe { AXUIElementPerformAction(element, action.0) };
    if code != 0 {
        return Err(format!(
            "Could not bring the selected window forward ({code})"
        ));
    }
    Ok(())
}
