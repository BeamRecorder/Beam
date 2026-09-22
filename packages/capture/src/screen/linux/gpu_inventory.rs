use std::{collections::BTreeSet, fs, path::Path};

use super::FfmpegAcceleration;

/// Unknown/incomplete inventories never exclude a backend. NVENC in particular
/// need not expose a DRM render node, so inspect PCI display controllers too.
pub(super) fn available_vendors() -> Option<BTreeSet<u32>> {
    let vendors = read_vendors(
        Path::new("/sys/bus/pci/devices"),
        Path::new("/sys/class/drm"),
    );
    // GPU containers can expose NVIDIA devices while filtering PCI sysfs.
    // Positive hints keep NVENC eligible; a stale hint only costs a probe.
    let nvidia_visible = Path::new("/dev/nvidiactl").exists()
        || Path::new("/dev/nvidia-uvm").exists()
        || std::env::var("NVIDIA_VISIBLE_DEVICES")
            .is_ok_and(|value| !value.is_empty() && value != "none" && value != "void");
    retain_nvidia_backend(vendors, nvidia_visible)
}

fn retain_nvidia_backend(
    mut vendors: Option<BTreeSet<u32>>,
    visible: bool,
) -> Option<BTreeSet<u32>> {
    if visible && let Some(vendors) = &mut vendors {
        vendors.insert(0x10de);
    }
    vendors
}

fn read_hex(path: &Path) -> Option<u32> {
    let value = fs::read_to_string(path).ok()?;
    u32::from_str_radix(value.trim().trim_start_matches("0x"), 16).ok()
}

fn read_vendors(pci: &Path, drm: &Path) -> Option<BTreeSet<u32>> {
    let mut vendors = BTreeSet::new();
    for entry in fs::read_dir(pci).ok()? {
        let device = entry.ok()?.path();
        if read_hex(&device.join("class"))? >> 16 == 0x03 {
            vendors.insert(read_hex(&device.join("vendor"))?);
        }
    }
    if vendors.is_empty()
        || vendors
            .iter()
            .any(|vendor| !matches!(vendor, 0x8086 | 0x10de | 0x1002))
    {
        return None;
    }
    for entry in fs::read_dir(drm).ok()? {
        let entry = entry.ok()?;
        let name = entry.file_name();
        let name = name.to_str()?;
        let suffix = name
            .strip_prefix("card")
            .or_else(|| name.strip_prefix("renderD"));
        if suffix.is_some_and(|suffix| {
            !suffix.is_empty() && suffix.bytes().all(|byte| byte.is_ascii_digit())
        }) && !vendors.contains(&read_hex(&entry.path().join("device/vendor"))?)
        {
            return None;
        }
    }
    Some(vendors)
}

pub(super) fn supports(vendors: Option<&BTreeSet<u32>>, acceleration: &FfmpegAcceleration) -> bool {
    let Some(vendors) = vendors else { return true };
    match acceleration {
        FfmpegAcceleration::Nvenc => vendors.contains(&0x10de),
        FfmpegAcceleration::Qsv => vendors.contains(&0x8086),
        FfmpegAcceleration::Amf => vendors.contains(&0x1002),
        _ => true,
    }
}

#[path = "../../../test/screen/linux/gpu_inventory.rs"]
mod gpu_inventory_checks;
