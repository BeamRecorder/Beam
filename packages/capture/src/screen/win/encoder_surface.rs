use super::gpu_scale::GpuScaler;

struct ContextLock(ID3D11Multithread);
impl Drop for ContextLock {
    fn drop(&mut self) {
        unsafe { self.0.Leave() };
    }
}
use crate::screen::{
    PixelCrop,
    frame_pool::{FrameLease, FramePool},
};
use std::sync::Arc;
use windows::{
    Graphics::DirectX::Direct3D11::IDirect3DSurface,
    Win32::{
        Foundation::{E_INVALIDARG, E_POINTER},
        Graphics::{
            Direct3D11::{
                D3D11_BIND_RENDER_TARGET, D3D11_BIND_SHADER_RESOURCE, D3D11_BOX,
                D3D11_TEXTURE2D_DESC, D3D11_USAGE_DEFAULT, ID3D11Device, ID3D11DeviceContext,
                ID3D11Multithread, ID3D11Texture2D,
            },
            Dxgi::IDXGISurface,
        },
        System::WinRT::Direct3D11::CreateDirect3D11SurfaceFromDXGISurface,
    },
    core::Interface,
};

#[derive(Clone)]
pub(super) struct OwnedSurface {
    pub lease: Arc<FrameLease<ID3D11Texture2D>>,
}

impl OwnedSurface {
    pub(super) fn surface(&self) -> windows::core::Result<IDirect3DSurface> {
        let dxgi = self.lease.value().cast::<IDXGISurface>()?;
        // SAFETY: the local wrapper and the shared lease retain the texture.
        unsafe { CreateDirect3D11SurfaceFromDXGISurface(&dxgi) }?.cast()
    }
}

pub(super) struct SurfaceCopies {
    pool: FramePool<ID3D11Texture2D>,
    size: (u32, u32),
    scaler: Option<GpuScaler>,
    device_configured: bool,
}

impl SurfaceCopies {
    pub(super) fn new(width: u32, height: u32, limit: usize) -> Self {
        Self {
            pool: FramePool::new(limit),
            size: (width, height),
            scaler: None,
            device_configured: false,
        }
    }
    pub(super) fn available(&self) -> bool {
        self.pool.available()
    }
    pub(super) fn copy(
        &mut self,
        device: &ID3D11Device,
        context: &ID3D11DeviceContext,
        source: &ID3D11Texture2D,
        crop: PixelCrop,
    ) -> windows::core::Result<Option<OwnedSurface>> {
        let mut desc = D3D11_TEXTURE2D_DESC::default();
        // SAFETY: source is a live texture and desc is a valid output pointer.
        unsafe { source.GetDesc(&mut desc) };
        if crop.start_x >= crop.end_x
            || crop.start_y >= crop.end_y
            || crop.end_x > desc.Width
            || crop.end_y > desc.Height
        {
            return Err(E_INVALIDARG.into());
        }
        if !self.device_configured {
            // Media Foundation can access the capture device from encoder threads.
            // Enable D3D's immediate-context serialization before handing it samples.
            let multithread = context.cast::<ID3D11Multithread>()?;
            let _ = unsafe { multithread.SetMultithreadProtected(true) };
            self.device_configured = true;
        }
        desc.Width = self.size.0;
        desc.Height = self.size.1;
        desc.Usage = D3D11_USAGE_DEFAULT;
        desc.BindFlags = (D3D11_BIND_RENDER_TARGET.0 | D3D11_BIND_SHADER_RESOURCE.0) as u32;
        desc.CPUAccessFlags = 0;
        desc.MiscFlags = 0;
        let Some(lease) = self.pool.acquire(|| {
            let mut texture = None;
            unsafe { device.CreateTexture2D(&desc, None, Some(&mut texture))? };
            texture.ok_or_else(|| windows::core::Error::from_hresult(E_POINTER))
        })?
        else {
            return Ok(None);
        };
        let multithread = context.cast::<ID3D11Multithread>()?;
        // Hold the context lock across the complete draw state sequence so
        // Media Foundation cannot interleave its own D3D calls with our scaler.
        unsafe { multithread.Enter() };
        let _context_lock = ContextLock(multithread);
        if (crop.width(), crop.height()) == self.size {
            let bounds = D3D11_BOX {
                left: crop.start_x,
                top: crop.start_y,
                front: 0,
                right: crop.end_x,
                bottom: crop.end_y,
                back: 1,
            };
            // The owned destination is never reused while any media sample or
            // retained still holds its lease. Cropping stays entirely on the GPU.
            unsafe {
                context.CopySubresourceRegion(lease.value(), 0, 0, 0, 0, source, 0, Some(&bounds))
            };
        } else {
            if self.scaler.is_none() {
                self.scaler = Some(GpuScaler::new(device)?);
            }
            if let Some(scaler) = &mut self.scaler {
                scaler.draw(device, context, source, lease.value(), crop)?;
            }
        }
        Ok(Some(OwnedSurface { lease }))
    }
}

#[cfg(all(test, feature = "hardware-tests"))]
fn copy_encoder_surface(
    device: &ID3D11Device,
    context: &ID3D11DeviceContext,
    source: &ID3D11Texture2D,
) -> windows::core::Result<IDirect3DSurface> {
    let mut desc = D3D11_TEXTURE2D_DESC::default();
    unsafe { source.GetDesc(&mut desc) };
    let mut copies = SurfaceCopies::new(desc.Width, desc.Height, 1);
    let owned = copies
        .copy(
            device,
            context,
            source,
            PixelCrop {
                start_x: 0,
                start_y: 0,
                end_x: desc.Width,
                end_y: desc.Height,
            },
        )?
        .ok_or(E_POINTER)?;
    owned.surface()
}

#[cfg(all(test, feature = "hardware-tests"))]
#[path = "encoder_surface_tests.rs"]
mod tests;
