use std::{ffi::c_void, ptr};

use windows::{
    Win32::{
        Foundation::RPC_E_CHANGED_MODE,
        Media::MediaFoundation::{
            IMFActivate, MF_DEVSOURCE_ATTRIBUTE_FRIENDLY_NAME, MF_DEVSOURCE_ATTRIBUTE_SOURCE_TYPE,
            MF_DEVSOURCE_ATTRIBUTE_SOURCE_TYPE_VIDCAP_GUID,
            MF_DEVSOURCE_ATTRIBUTE_SOURCE_TYPE_VIDCAP_SYMBOLIC_LINK, MF_VERSION,
            MFCreateAttributes, MFEnumDeviceSources, MFSTARTUP_FULL, MFShutdown, MFStartup,
        },
        System::Com::{COINIT_MULTITHREADED, CoInitializeEx, CoTaskMemFree, CoUninitialize},
    },
    core::{GUID, PWSTR},
};

use crate::{CameraDevice, CameraError};

use super::camera_windows_error;

pub(super) struct MfRuntime {
    com_owned: bool,
}

impl MfRuntime {
    pub(super) fn start() -> Result<Self, CameraError> {
        let result = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
        let com_owned = if result.is_ok() {
            true
        } else if result == RPC_E_CHANGED_MODE {
            false
        } else {
            return Err(CameraError::Backend(format!("initializing COM: {result}")));
        };
        if let Err(error) = unsafe { MFStartup(MF_VERSION, MFSTARTUP_FULL) } {
            if com_owned {
                unsafe { CoUninitialize() };
            }
            return Err(CameraError::Backend(format!(
                "starting Media Foundation: {error}"
            )));
        }
        Ok(Self { com_owned })
    }
}

impl Drop for MfRuntime {
    fn drop(&mut self) {
        let _ = unsafe { MFShutdown() };
        if self.com_owned {
            unsafe { CoUninitialize() };
        }
    }
}

pub fn list_cameras() -> Result<Vec<CameraDevice>, CameraError> {
    let _runtime = MfRuntime::start()?;
    let mut devices: Vec<_> = enumerate()?.into_iter().map(|(device, _)| device).collect();
    devices.sort_by(|left, right| left.id.cmp(&right.id));
    Ok(devices)
}

pub(super) fn activate_camera(device_id: &str) -> Result<IMFActivate, CameraError> {
    enumerate()?
        .into_iter()
        .find(|(device, _)| device.id == device_id)
        .map(|(_, activate)| activate)
        .ok_or_else(|| CameraError::DeviceUnavailable(device_id.into()))
}

fn enumerate() -> Result<Vec<(CameraDevice, IMFActivate)>, CameraError> {
    let mut attributes = None;
    unsafe { MFCreateAttributes(&mut attributes, 1) }
        .map_err(|error| CameraError::Backend(format!("camera enumeration attributes: {error}")))?;
    let attributes = attributes
        .ok_or_else(|| CameraError::Backend("missing Media Foundation attributes".into()))?;
    unsafe {
        attributes.SetGUID(
            &MF_DEVSOURCE_ATTRIBUTE_SOURCE_TYPE,
            &MF_DEVSOURCE_ATTRIBUTE_SOURCE_TYPE_VIDCAP_GUID,
        )
    }
    .map_err(|error| CameraError::Backend(format!("selecting video sources: {error}")))?;
    let mut pointer: *mut Option<IMFActivate> = ptr::null_mut();
    let mut count = 0_u32;
    unsafe { MFEnumDeviceSources(&attributes, &mut pointer, &mut count) }.map_err(|error| {
        camera_windows_error(error, "enumerating cameras", CameraError::Backend)
    })?;
    if count > 0 && pointer.is_null() {
        return Err(CameraError::Backend(
            "Media Foundation returned a camera count without activations".into(),
        ));
    }
    let activations = if count == 0 || pointer.is_null() {
        Vec::new()
    } else {
        let slots = unsafe { std::slice::from_raw_parts_mut(pointer, count as usize) };
        slots.iter_mut().filter_map(Option::take).collect()
    };
    unsafe { CoTaskMemFree(Some(pointer.cast::<c_void>())) };
    activations
        .into_iter()
        .map(|activation| {
            let id = allocated_string(
                &activation,
                &MF_DEVSOURCE_ATTRIBUTE_SOURCE_TYPE_VIDCAP_SYMBOLIC_LINK,
            )?;
            let name = allocated_string(&activation, &MF_DEVSOURCE_ATTRIBUTE_FRIENDLY_NAME)?;
            if id.is_empty() || name.is_empty() {
                return Err(CameraError::Backend(
                    "Media Foundation camera omitted its symbolic link or name".into(),
                ));
            }
            Ok((CameraDevice { id, name }, activation))
        })
        .collect()
}

fn allocated_string(activation: &IMFActivate, key: &GUID) -> Result<String, CameraError> {
    let mut pointer = PWSTR::null();
    let mut length = 0_u32;
    unsafe { activation.GetAllocatedString(key, &mut pointer, &mut length) }
        .map_err(|error| CameraError::Backend(format!("camera device property: {error}")))?;
    let result = if pointer.is_null() || length == 0 {
        Ok(String::new())
    } else {
        let units = unsafe { std::slice::from_raw_parts(pointer.0, length as usize) };
        decode_device_property(units)
    };
    unsafe { CoTaskMemFree(Some(pointer.0.cast::<c_void>())) };
    result
}

fn decode_device_property(units: &[u16]) -> Result<String, CameraError> {
    String::from_utf16(units)
        .map_err(|error| CameraError::Backend(format!("invalid camera property UTF-16: {error}")))
}

#[path = "../../test/windows/catalog.rs"]
mod catalog_checks;
