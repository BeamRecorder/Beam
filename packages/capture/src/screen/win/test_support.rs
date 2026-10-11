#![allow(clippy::expect_used)]
use windows::Win32::{
    Foundation::HMODULE,
    Graphics::{
        Direct3D::D3D_DRIVER_TYPE_WARP,
        Direct3D11::{
            D3D11_CPU_ACCESS_READ, D3D11_CREATE_DEVICE_BGRA_SUPPORT, D3D11_MAP_READ,
            D3D11_MAPPED_SUBRESOURCE, D3D11_SDK_VERSION, D3D11_USAGE_STAGING, D3D11CreateDevice,
        },
        Dxgi::Common::{DXGI_FORMAT_B8G8R8A8_UNORM, DXGI_SAMPLE_DESC},
    },
    System::WinRT::{
        Direct3D11::IDirect3DDxgiInterfaceAccess, RO_INIT_MULTITHREADED, RoInitialize,
        RoUninitialize,
    },
};
use windows::{
    Graphics::DirectX::Direct3D11::IDirect3DSurface,
    Win32::Graphics::Direct3D11::{
        D3D11_BIND_RENDER_TARGET, D3D11_BIND_SHADER_RESOURCE, D3D11_TEXTURE2D_DESC,
        D3D11_USAGE_DEFAULT, ID3D11Device, ID3D11DeviceContext, ID3D11Texture2D,
    },
    core::Interface,
};

pub(super) struct Apartment;
impl Drop for Apartment {
    fn drop(&mut self) {
        unsafe { RoUninitialize() };
    }
}

pub(super) fn device() -> (Apartment, ID3D11Device, ID3D11DeviceContext) {
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

pub(super) fn texture(device: &ID3D11Device, width: u32, height: u32) -> ID3D11Texture2D {
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

pub(super) fn update(
    context: &ID3D11DeviceContext,
    texture: &ID3D11Texture2D,
    width: u32,
    pixels: &[u8],
) {
    unsafe { context.UpdateSubresource(texture, 0, None, pixels.as_ptr().cast(), width * 4, 0) };
}

pub(super) fn read(
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
