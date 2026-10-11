use windows::{
    Graphics::DirectX::Direct3D11::IDirect3DSurface,
    Win32::{
        Foundation::E_POINTER,
        Graphics::{
            Direct3D11::{
                D3D11_BIND_RENDER_TARGET, D3D11_BIND_SHADER_RESOURCE, D3D11_TEXTURE2D_DESC,
                D3D11_USAGE_DEFAULT, ID3D11Device, ID3D11DeviceContext, ID3D11Texture2D,
            },
            Dxgi::IDXGISurface,
        },
        System::WinRT::Direct3D11::CreateDirect3D11SurfaceFromDXGISurface,
    },
    core::Interface,
};

/// WGC returns its frame to the pool after the capture callback. The encoder
/// consumes samples asynchronously, so a COM reference to that surface is not
/// a snapshot. Keep a separate GPU texture alive through the media sample.
pub(super) fn copy_encoder_surface(
    device: &ID3D11Device,
    context: &ID3D11DeviceContext,
    source: &ID3D11Texture2D,
) -> windows::core::Result<IDirect3DSurface> {
    let mut desc = D3D11_TEXTURE2D_DESC::default();
    // SAFETY: source is a live texture and desc is a valid output pointer.
    unsafe { source.GetDesc(&mut desc) };
    desc.Usage = D3D11_USAGE_DEFAULT;
    desc.BindFlags = (D3D11_BIND_RENDER_TARGET.0 | D3D11_BIND_SHADER_RESOURCE.0) as u32;
    desc.CPUAccessFlags = 0;
    desc.MiscFlags = 0;
    let mut texture = None;
    // SAFETY: the descriptor preserves source dimensions, format and sample
    // layout. Both resources belong to this capture device and context.
    unsafe { device.CreateTexture2D(&desc, None, Some(&mut texture))? };
    let texture = texture.ok_or_else(|| windows::core::Error::from_hresult(E_POINTER))?;
    unsafe { context.CopyResource(&texture, source) };
    let dxgi_surface = texture.cast::<IDXGISurface>()?;
    // SAFETY: the wrapper retains this live DXGI surface/texture for the sample.
    unsafe { CreateDirect3D11SurfaceFromDXGISurface(&dxgi_surface) }?.cast()
}

#[cfg(all(test, feature = "hardware-tests"))]
#[path = "encoder_surface_tests.rs"]
mod tests;
