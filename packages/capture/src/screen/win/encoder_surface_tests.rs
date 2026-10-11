#![allow(clippy::expect_used)]

use super::*;
use windows::{
    Foundation::TimeSpan,
    Media::Core::MediaStreamSample,
    Win32::{
        Foundation::HMODULE,
        Graphics::{
            Direct3D::D3D_DRIVER_TYPE_WARP,
            Direct3D11::{
                D3D11_CPU_ACCESS_READ, D3D11_CREATE_DEVICE_BGRA_SUPPORT, D3D11_MAP_READ,
                D3D11_MAPPED_SUBRESOURCE, D3D11_SDK_VERSION, D3D11_USAGE_STAGING,
                D3D11CreateDevice,
            },
            Dxgi::Common::{DXGI_FORMAT_B8G8R8A8_UNORM, DXGI_SAMPLE_DESC},
        },
        System::WinRT::{
            Direct3D11::IDirect3DDxgiInterfaceAccess, RO_INIT_MULTITHREADED, RoInitialize,
            RoUninitialize,
        },
    },
};

struct Apartment;
impl Drop for Apartment {
    fn drop(&mut self) {
        unsafe { RoUninitialize() };
    }
}

fn device() -> (Apartment, ID3D11Device, ID3D11DeviceContext) {
    unsafe { RoInitialize(RO_INIT_MULTITHREADED) }.expect("WinRT apartment");
    let apartment = Apartment;
    let (mut device, mut context) = (None, None);
    // WARP exercises real D3D texture lifetimes even on a headless Windows runner.
    unsafe {
        D3D11CreateDevice(
            None,
            D3D_DRIVER_TYPE_WARP,
            HMODULE::default(),
            D3D11_CREATE_DEVICE_BGRA_SUPPORT,
            None,
            D3D11_SDK_VERSION,
            Some(&mut device),
            None,
            Some(&mut context),
        )
    }
    .expect("D3D11 WARP device");
    (
        apartment,
        device.expect("device"),
        context.expect("context"),
    )
}

fn texture(device: &ID3D11Device, width: u32, height: u32) -> ID3D11Texture2D {
    let desc = D3D11_TEXTURE2D_DESC {
        Width: width,
        Height: height,
        MipLevels: 1,
        ArraySize: 1,
        Format: DXGI_FORMAT_B8G8R8A8_UNORM,
        SampleDesc: DXGI_SAMPLE_DESC {
            Count: 1,
            Quality: 0,
        },
        Usage: D3D11_USAGE_DEFAULT,
        BindFlags: (D3D11_BIND_RENDER_TARGET.0 | D3D11_BIND_SHADER_RESOURCE.0) as u32,
        ..Default::default()
    };
    let mut texture = None;
    unsafe { device.CreateTexture2D(&desc, None, Some(&mut texture)) }.expect("texture");
    texture.expect("texture output")
}

fn update(context: &ID3D11DeviceContext, texture: &ID3D11Texture2D, width: u32, pixels: &[u8]) {
    unsafe { context.UpdateSubresource(texture, 0, None, pixels.as_ptr().cast(), width * 4, 0) };
}

fn read(
    device: &ID3D11Device,
    context: &ID3D11DeviceContext,
    surface: &IDirect3DSurface,
) -> Vec<u8> {
    let access = surface
        .cast::<IDirect3DDxgiInterfaceAccess>()
        .expect("DXGI access");
    let source = unsafe { access.GetInterface::<ID3D11Texture2D>() }.expect("texture interface");
    let mut desc = D3D11_TEXTURE2D_DESC::default();
    unsafe { source.GetDesc(&mut desc) };
    desc.Usage = D3D11_USAGE_STAGING;
    desc.BindFlags = 0;
    desc.CPUAccessFlags = D3D11_CPU_ACCESS_READ.0 as u32;
    let mut staging = None;
    unsafe { device.CreateTexture2D(&desc, None, Some(&mut staging)) }.expect("readback texture");
    let staging = staging.expect("staging output");
    unsafe { context.CopyResource(&staging, &source) };
    let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
    unsafe { context.Map(&staging, 0, D3D11_MAP_READ, 0, Some(&mut mapped)) }
        .expect("map readback");
    let mut pixels = Vec::new();
    for row in 0..desc.Height as usize {
        let start = unsafe {
            mapped
                .pData
                .cast::<u8>()
                .add(row * mapped.RowPitch as usize)
        };
        pixels.extend_from_slice(unsafe {
            std::slice::from_raw_parts(start, desc.Width as usize * 4)
        });
    }
    unsafe { context.Unmap(&staging, 0) };
    pixels
}

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
