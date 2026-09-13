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

#[cfg(test)]
#[allow(clippy::expect_used)]
mod tests {
    use super::*;

    fn fixture() -> tempfile::TempDir {
        let root = tempfile::tempdir().expect("GPU inventory fixture");
        fs::create_dir_all(root.path().join("pci/intel")).expect("PCI root");
        fs::write(root.path().join("pci/intel/class"), "0x030000\n").expect("class");
        fs::write(root.path().join("pci/intel/vendor"), "0x8086\n").expect("vendor");
        fs::create_dir_all(root.path().join("drm/card1/device")).expect("DRM root");
        fs::write(root.path().join("drm/card1/device/vendor"), "0x8086\n").expect("DRM vendor");
        root
    }

    #[test]
    fn complete_inventory_excludes_only_absent_vendor_backends() {
        let root = fixture();
        let vendors = read_vendors(&root.path().join("pci"), &root.path().join("drm"));
        assert!(vendors.is_some());
        assert!(supports(vendors.as_ref(), &FfmpegAcceleration::Qsv));
        assert!(!supports(vendors.as_ref(), &FfmpegAcceleration::Nvenc));
        assert!(!supports(vendors.as_ref(), &FfmpegAcceleration::Amf));
        assert!(supports(
            vendors.as_ref(),
            &FfmpegAcceleration::Vaapi {
                device: "/dev/dri/renderD128".into()
            }
        ));

        // A second PCI GPU without any render node must still enable NVENC.
        fs::create_dir(root.path().join("pci/nvidia")).expect("NVIDIA device");
        fs::write(root.path().join("pci/nvidia/class"), "0x030200").expect("3D controller");
        fs::write(root.path().join("pci/nvidia/vendor"), "0x10de").expect("NVIDIA vendor");
        let vendors = read_vendors(&root.path().join("pci"), &root.path().join("drm"));
        assert!(supports(vendors.as_ref(), &FfmpegAcceleration::Nvenc));
        assert!(supports(vendors.as_ref(), &FfmpegAcceleration::Qsv));
    }

    #[test]
    fn incomplete_or_inconsistent_inventory_keeps_every_backend() {
        let root = fixture();
        let pci = root.path().join("pci");
        let drm = root.path().join("drm");
        fs::write(drm.join("card1/device/vendor"), "0x1002").expect("unaccounted GPU");
        assert!(read_vendors(&pci, &drm).is_none());
        fs::remove_file(pci.join("intel/class")).expect("incomplete PCI view");
        assert!(read_vendors(&pci, &drm).is_none());
        assert!(read_vendors(&root.path().join("missing"), &drm).is_none());
        for backend in [
            FfmpegAcceleration::Nvenc,
            FfmpegAcceleration::Qsv,
            FfmpegAcceleration::Amf,
        ] {
            assert!(supports(None, &backend));
        }
    }

    #[test]
    fn device_visibility_retains_nvenc_in_a_partial_pci_namespace() {
        let intel = Some(BTreeSet::from([0x8086]));
        let visible = retain_nvidia_backend(intel.clone(), true);
        assert!(supports(visible.as_ref(), &FfmpegAcceleration::Nvenc));
        assert!(!supports(
            retain_nvidia_backend(intel, false).as_ref(),
            &FfmpegAcceleration::Nvenc
        ));
        assert!(retain_nvidia_backend(None, true).is_none());
    }
}
