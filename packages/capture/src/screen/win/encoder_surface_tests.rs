#![allow(clippy::expect_used)]
use super::super::test_support::*;
use super::*;
use windows::{Foundation::TimeSpan, Media::Core::MediaStreamSample};

#[test]
fn queued_gpu_snapshots_survive_capture_surface_reuse_and_release() {
    let (_apartment, device, context) = device();
    let source = texture(&device, 4, 2);
    let mut snapshots = Vec::new();
    for color in [17, 91, 203] {
        update(&context, &source, 4, &[color; 32]);
        snapshots.push(copy_encoder_surface(&device, &context, &source).expect("GPU snapshot"));
    }
    update(&context, &source, 4, &[0; 32]);
    drop(source);
    for (surface, color) in snapshots.iter().zip([17, 91, 203]) {
        assert_eq!(read(&device, &context, surface), vec![color; 32]);
    }
}

#[test]
fn gpu_snapshot_preserves_dimensions_bgra_pixels_and_row_order() {
    let (_apartment, device, context) = device();
    for (width, height) in [(2, 4), (4, 2), (64, 64)] {
        let source = texture(&device, width, height);
        let pixels = (0..width * height * 4)
            .map(|index| (index % 251) as u8)
            .collect::<Vec<_>>();
        update(&context, &source, width, &pixels);
        let surface = copy_encoder_surface(&device, &context, &source).expect("snapshot");
        let desc = surface.Description().expect("surface description");
        assert_eq!((desc.Width, desc.Height), (width as i32, height as i32));
        assert_eq!(read(&device, &context, &surface), pixels);
    }
}

#[test]
fn media_sample_owns_its_gpu_snapshot_after_local_resources_are_dropped() {
    let (_apartment, device, context) = device();
    let sample = {
        let source = texture(&device, 2, 2);
        update(&context, &source, 2, &[123; 16]);
        let surface = copy_encoder_surface(&device, &context, &source).expect("snapshot");
        MediaStreamSample::CreateFromDirect3D11Surface(&surface, TimeSpan { Duration: 42 })
            .expect("media sample")
    };
    assert_eq!(sample.Timestamp().expect("timestamp").Duration, 42);
    assert_eq!(
        read(
            &device,
            &context,
            &sample.Direct3D11Surface().expect("sample surface")
        ),
        vec![123; 16]
    );
}

#[test]
fn gpu_crop_preserves_pixels_and_rejects_out_of_bounds_before_copying() {
    let (_apartment, device, context) = device();
    let source = texture(&device, 10, 6);
    let pixels = (0..240)
        .map(|index| (index % 251) as u8)
        .collect::<Vec<_>>();
    update(&context, &source, 10, &pixels);
    let mut copies = SurfaceCopies::new(4, 2, 1);
    for crop in [
        PixelCrop {
            start_x: 5,
            start_y: 0,
            end_x: 5,
            end_y: 2,
        },
        PixelCrop {
            start_x: 0,
            start_y: 0,
            end_x: 11,
            end_y: 2,
        },
    ] {
        assert!(copies.copy(&device, &context, &source, crop).is_err());
        assert!(copies.available());
    }
    let crop = PixelCrop {
        start_x: 2,
        start_y: 2,
        end_x: 6,
        end_y: 4,
    };
    let owned = copies
        .copy(&device, &context, &source, crop)
        .expect("copy")
        .expect("surface");
    let expected = [pixels[88..104].to_vec(), pixels[128..144].to_vec()].concat();
    assert_eq!(
        read(&device, &context, &owned.surface().expect("surface")),
        expected
    );
    assert!(!copies.available());
    drop(owned);
    assert!(copies.available());
}

#[test]
fn gpu_window_resize_keeps_both_sides_and_uses_opaque_letterboxing() {
    let (_apartment, device, context) = device();
    let source = texture(&device, 8, 4);
    let pixels = (0..32)
        .flat_map(|pixel| {
            if pixel % 8 < 4 {
                [255, 0, 0, 255]
            } else {
                [0, 0, 255, 255]
            }
        })
        .collect::<Vec<_>>();
    update(&context, &source, 8, &pixels);
    let mut copies = SurfaceCopies::new(4, 4, 1);
    let owned = copies
        .copy(
            &device,
            &context,
            &source,
            PixelCrop {
                start_x: 0,
                start_y: 0,
                end_x: 8,
                end_y: 4,
            },
        )
        .expect("scale")
        .expect("surface");
    let result = read(&device, &context, &owned.surface().expect("surface"));
    assert_eq!(&result[..16], &[0, 0, 0, 255].repeat(4));
    assert_eq!(&result[48..], &[0, 0, 0, 255].repeat(4));
    assert_eq!(&result[16..20], &[255, 0, 0, 255]);
    assert_eq!(&result[28..32], &[0, 0, 255, 255]);
}

#[test]
fn thousands_of_texture_reuses_preserve_all_inflight_samples() {
    let (_apartment, device, context) = device();
    let source = texture(&device, 4, 4);
    let crop = PixelCrop {
        start_x: 0,
        start_y: 0,
        end_x: 4,
        end_y: 4,
    };
    let mut copies = SurfaceCopies::new(4, 4, 3);
    let mut inflight = std::collections::VecDeque::new();
    for index in 0..5000_u32 {
        let color = (index % 251) as u8;
        update(&context, &source, 4, &[color; 64]);
        let owned = copies
            .copy(&device, &context, &source, crop)
            .expect("copy")
            .expect("bounded surface");
        inflight.push_back((owned, color));
        if inflight.len() == 3 {
            assert!(
                copies
                    .copy(&device, &context, &source, crop)
                    .expect("full pool")
                    .is_none()
            );
            update(&context, &source, 4, &[0; 64]);
            let (owned, expected) = inflight.pop_front().expect("oldest sample");
            assert_eq!(
                read(&device, &context, &owned.surface().expect("surface")),
                vec![expected; 64]
            );
        }
    }
    for (owned, expected) in inflight {
        assert_eq!(
            read(&device, &context, &owned.surface().expect("surface")),
            vec![expected; 64]
        );
    }
}

#[test]
fn owned_readback_unmaps_padded_rows_over_repeated_screenshots() {
    let (_apartment, device, context) = device();
    for width in [1, 3, 17, 63, 65] {
        let source = texture(&device, width, 7);
        let pixels = (0..width * 7 * 4)
            .map(|pixel| (pixel % 251) as u8)
            .collect::<Vec<_>>();
        update(&context, &source, width, &pixels);
        for _ in 0..100 {
            assert_eq!(
                super::super::readback::read_bgra(&device, &context, &source)
                    .expect("owned readback"),
                pixels
            );
        }
    }
}
