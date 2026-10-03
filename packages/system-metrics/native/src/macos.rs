use crate::{GpuDevice, GpuEngine, GpuSample};
use std::{
    ffi::{CStr, c_char, c_void},
    ptr,
};

#[link(name = "IOKit", kind = "framework")]
unsafe extern "C" {
    fn IOServiceMatching(name: *const c_char) -> *mut c_void;
    fn IOServiceGetMatchingServices(port: u32, matching: *mut c_void, iterator: *mut u32) -> i32;
    fn IOIteratorNext(iterator: u32) -> u32;
    fn IOObjectRelease(object: u32) -> i32;
    fn IORegistryEntryGetRegistryEntryID(entry: u32, id: *mut u64) -> i32;
    fn IORegistryEntryGetName(entry: u32, name: *mut c_char) -> i32;
    fn IORegistryEntryCreateCFProperty(
        entry: u32,
        key: *const c_void,
        allocator: *const c_void,
        options: u32,
    ) -> *const c_void;
}
#[link(name = "CoreFoundation", kind = "framework")]
unsafe extern "C" {
    fn CFStringCreateWithCString(
        allocator: *const c_void,
        string: *const c_char,
        encoding: u32,
    ) -> *const c_void;
    fn CFDictionaryGetValue(dictionary: *const c_void, key: *const c_void) -> *const c_void;
    fn CFGetTypeID(value: *const c_void) -> usize;
    fn CFDictionaryGetTypeID() -> usize;
    fn CFNumberGetTypeID() -> usize;
    fn CFNumberGetValue(number: *const c_void, kind: i32, value: *mut c_void) -> bool;
    fn CFRelease(value: *const c_void);
}
struct IoObject(u32);
impl Drop for IoObject {
    fn drop(&mut self) {
        unsafe {
            IOObjectRelease(self.0);
        }
    }
}
struct CfObject(*const c_void);
impl Drop for CfObject {
    fn drop(&mut self) {
        if !self.0.is_null() {
            unsafe {
                CFRelease(self.0);
            }
        }
    }
}
fn key(name: &CStr) -> CfObject {
    CfObject(unsafe { CFStringCreateWithCString(ptr::null(), name.as_ptr(), 0x08000100) })
}
fn percent(dictionary: *const c_void, name: &CStr) -> Option<f64> {
    let key = key(name);
    if key.0.is_null() {
        return None;
    }
    let number = unsafe { CFDictionaryGetValue(dictionary, key.0) };
    if number.is_null() || unsafe { CFGetTypeID(number) != CFNumberGetTypeID() } {
        return None;
    }
    let mut value = 0_f64;
    let valid = unsafe { CFNumberGetValue(number, 6, (&mut value as *mut f64).cast()) };
    (valid && value.is_finite() && (0.0..=100.0).contains(&value)).then_some(value)
}

pub(super) fn sample() -> GpuSample {
    let matching = unsafe { IOServiceMatching(c"IOAccelerator".as_ptr()) };
    if matching.is_null() {
        return GpuSample::unavailable("iokit-error", "Cannot match IOAccelerator devices");
    }
    let mut iterator = 0;
    let result = unsafe { IOServiceGetMatchingServices(0, matching, &mut iterator) };
    if result != 0 {
        return GpuSample::unavailable(
            "iokit-error",
            format!("IOAccelerator query failed: {result}"),
        );
    }
    let iterator = IoObject(iterator);
    let property = key(c"PerformanceStatistics");
    if property.0.is_null() {
        return GpuSample::unavailable("iokit-error", "Cannot create GPU property key");
    }
    let mut devices = vec![];
    loop {
        let entry = unsafe { IOIteratorNext(iterator.0) };
        if entry == 0 {
            break;
        }
        let entry = IoObject(entry);
        let stats = CfObject(unsafe {
            IORegistryEntryCreateCFProperty(entry.0, property.0, ptr::null(), 0)
        });
        if stats.0.is_null() || unsafe { CFGetTypeID(stats.0) != CFDictionaryGetTypeID() } {
            continue;
        }
        let mut id = 0;
        if unsafe { IORegistryEntryGetRegistryEntryID(entry.0, &mut id) } != 0 {
            continue;
        }
        let mut name = [0 as c_char; 128];
        let named = unsafe { IORegistryEntryGetName(entry.0, name.as_mut_ptr()) } == 0;
        // Registry counters are device-wide. Never describe them as per-process utilization.
        let engines = [
            ("device", c"Device Utilization %"),
            ("renderer", c"Renderer Utilization %"),
            ("tiler", c"Tiler Utilization %"),
        ]
        .into_iter()
        .filter_map(|(name, key)| {
            percent(stats.0, key).map(|busy_percent| GpuEngine {
                name: name.into(),
                busy_percent,
            })
        })
        .collect::<Vec<_>>();
        if !engines.is_empty() {
            devices.push(GpuDevice {
                id: format!("ioregistry-{id}"),
                name: if named {
                    unsafe { CStr::from_ptr(name.as_ptr()) }
                        .to_string_lossy()
                        .into_owned()
                } else {
                    format!("IOAccelerator {id}")
                },
                engines,
            });
        }
    }
    if devices.is_empty() {
        GpuSample::unavailable(
            "counters-unavailable",
            "IOAccelerator does not expose utilization percentages on this GPU/driver",
        )
    } else {
        GpuSample::sampled("macos-iokit", "device", devices)
    }
}
