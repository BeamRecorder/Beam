//! A private Core Audio process tap for duplex output devices.

use std::{
    ffi::{CStr, c_void},
    ptr::NonNull,
    sync::atomic::{AtomicU32, Ordering},
};

use objc2::AnyThread;
use objc2_core_audio::{
    AudioHardwareCreateAggregateDevice, AudioHardwareCreateProcessTap,
    AudioHardwareDestroyAggregateDevice, AudioHardwareDestroyProcessTap, AudioObjectID,
    CATapDescription, CATapMuteBehavior, kAudioAggregateDeviceNameKey,
    kAudioAggregateDeviceTapAutoStartKey, kAudioAggregateDeviceTapListKey,
    kAudioAggregateDeviceUIDKey, kAudioDevicePermissionsError, kAudioEndPointDeviceIsPrivateKey,
    kAudioHardwareBadDeviceError, kAudioSubTapDriftCompensationKey, kAudioSubTapUIDKey,
};
use objc2_core_foundation::{
    CFArray, CFDictionary, CFMutableDictionary, CFRetained, CFString, kCFAllocatorDefault,
    kCFTypeArrayCallBacks, kCFTypeDictionaryKeyCallBacks, kCFTypeDictionaryValueCallBacks,
};
use objc2_foundation::{NSArray, NSNumber, NSString};

use crate::AudioError;

static INSTANCE: AtomicU32 = AtomicU32::new(0);

pub(crate) struct ProcessTap {
    tap_id: AudioObjectID,
    aggregate_id: AudioObjectID,
    aggregate_uid: String,
}

impl ProcessTap {
    pub(crate) fn new(output_uid: &str) -> Result<Self, AudioError> {
        let suffix = format!(
            "{}.{}",
            std::process::id(),
            INSTANCE.fetch_add(1, Ordering::Relaxed)
        );
        let processes = NSArray::new();
        let output_uid = NSString::from_str(output_uid);
        let description = unsafe {
            CATapDescription::initWithProcesses_andDeviceUID_withStream(
                CATapDescription::alloc(),
                &processes,
                &output_uid,
                0,
            )
        };
        unsafe {
            description.setMuteBehavior(CATapMuteBehavior::Unmuted);
            description.setName(&NSString::from_str(&format!("Beam system audio {suffix}")));
            description.setPrivate(true);
            // An exclusive tap excludes its listed processes. The empty list
            // therefore captures all processes routed to this output stream.
            description.setExclusive(true);
        }
        let mut tap_id = 0;
        let status = unsafe { AudioHardwareCreateProcessTap(Some(&description), &mut tap_id) };
        if status != 0 {
            return Err(os_error("create Core Audio process tap", status));
        }

        let aggregate_uid = format!("com.beam.native-media.tap.{suffix}");
        let tap_uid = unsafe { description.UUID().UUIDString() };
        let properties = match aggregate_properties(
            &aggregate_uid,
            &format!("Beam audio tap {suffix}"),
            tap_uid.as_ref(),
        ) {
            Ok(properties) => properties,
            Err(error) => {
                unsafe { AudioHardwareDestroyProcessTap(tap_id) };
                return Err(error);
            }
        };
        let mut aggregate_id = 0;
        let status = unsafe {
            AudioHardwareCreateAggregateDevice(
                properties.as_ref(),
                NonNull::from(&mut aggregate_id),
            )
        };
        if status != 0 {
            unsafe { AudioHardwareDestroyProcessTap(tap_id) };
            return Err(os_error("create Core Audio tap aggregate", status));
        }
        Ok(Self {
            tap_id,
            aggregate_id,
            aggregate_uid,
        })
    }

    pub(crate) fn device_id(&self) -> cpal::DeviceId {
        cpal::DeviceId::new(cpal::HostId::CoreAudio, &self.aggregate_uid)
    }
}

impl Drop for ProcessTap {
    fn drop(&mut self) {
        unsafe {
            let _ = AudioHardwareDestroyAggregateDevice(self.aggregate_id);
            let _ = AudioHardwareDestroyProcessTap(self.tap_id);
        }
    }
}

fn os_error(operation: &str, status: i32) -> AudioError {
    let reason = format!("{operation} failed with OSStatus {status}");
    match status {
        value if value == kAudioDevicePermissionsError => AudioError::PermissionDenied(reason),
        value if value == kAudioHardwareBadDeviceError => AudioError::DeviceUnavailable(reason),
        _ => AudioError::Backend(reason),
    }
}

fn key(name: &'static CStr) -> Result<CFRetained<CFString>, AudioError> {
    unsafe { CFString::with_c_string(kCFAllocatorDefault, name.as_ptr(), 0x08000100) }
        .ok_or_else(|| AudioError::Backend("Core Audio property key allocation failed".into()))
}

unsafe fn insert(
    dictionary: &CFMutableDictionary,
    name: &'static CStr,
    value: *const c_void,
) -> Result<(), AudioError> {
    let name = key(name)?;
    unsafe {
        CFMutableDictionary::set_value(
            Some(dictionary),
            &*name as *const CFString as *const c_void,
            value,
        );
    }
    Ok(())
}

fn aggregate_properties(
    uid: &str,
    name: &str,
    tap_uid: &NSString,
) -> Result<CFRetained<CFDictionary>, AudioError> {
    let tap = unsafe {
        CFMutableDictionary::new(
            kCFAllocatorDefault,
            2,
            &kCFTypeDictionaryKeyCallBacks,
            &kCFTypeDictionaryValueCallBacks,
        )
    }
    .ok_or_else(|| AudioError::Backend("Core Audio tap dictionary allocation failed".into()))?;
    let drift = NSNumber::new_bool(true);
    unsafe {
        insert(
            &tap,
            kAudioSubTapUIDKey,
            tap_uid as *const NSString as *const c_void,
        )?;
        insert(
            &tap,
            kAudioSubTapDriftCompensationKey,
            &*drift as *const NSNumber as *const c_void,
        )?;
    }
    let entries = [tap];
    let taps = unsafe {
        CFArray::new(
            kCFAllocatorDefault,
            entries.as_ptr() as *mut *const c_void,
            entries.len() as isize,
            &kCFTypeArrayCallBacks,
        )
    }
    .ok_or_else(|| AudioError::Backend("Core Audio tap list allocation failed".into()))?;
    let dictionary = unsafe {
        CFMutableDictionary::new(
            kCFAllocatorDefault,
            5,
            &kCFTypeDictionaryKeyCallBacks,
            &kCFTypeDictionaryValueCallBacks,
        )
    }
    .ok_or_else(|| AudioError::Backend("Core Audio aggregate property allocation failed".into()))?;
    let name = CFString::from_str(name);
    let uid = CFString::from_str(uid);
    let enabled = NSNumber::new_bool(true);
    unsafe {
        insert(
            &dictionary,
            kAudioAggregateDeviceNameKey,
            &*name as *const CFString as *const c_void,
        )?;
        insert(
            &dictionary,
            kAudioAggregateDeviceUIDKey,
            &*uid as *const CFString as *const c_void,
        )?;
        insert(
            &dictionary,
            kAudioAggregateDeviceTapListKey,
            &*taps as *const CFArray as *const c_void,
        )?;
        insert(
            &dictionary,
            kAudioAggregateDeviceTapAutoStartKey,
            &*enabled as *const NSNumber as *const c_void,
        )?;
        insert(
            &dictionary,
            kAudioEndPointDeviceIsPrivateKey,
            &*enabled as *const NSNumber as *const c_void,
        )?;
        Ok(CFRetained::cast_unchecked::<CFDictionary>(dictionary))
    }
}

#[path = "../../test/macos/tap.rs"]
mod tap_checks;
