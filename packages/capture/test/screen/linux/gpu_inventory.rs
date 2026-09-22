#![cfg(test)]
#![allow(clippy::expect_used)]

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
