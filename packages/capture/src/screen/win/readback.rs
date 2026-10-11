use windows::Win32::{
    Foundation::{E_INVALIDARG, E_POINTER},
    Graphics::Direct3D11::{
        D3D11_CPU_ACCESS_READ, D3D11_MAP_READ, D3D11_MAPPED_SUBRESOURCE, D3D11_TEXTURE2D_DESC,
        D3D11_USAGE_STAGING, ID3D11Device, ID3D11DeviceContext, ID3D11Texture2D,
    },
};

struct Mapped<'a> {
    context: &'a ID3D11DeviceContext,
    texture: ID3D11Texture2D,
}
impl Drop for Mapped<'_> {
    fn drop(&mut self) {
        // SAFETY: this guard is created only after a successful Map; its texture
        // stays alive until the matching Unmap, including early error exits.
        unsafe { self.context.Unmap(&self.texture, 0) };
    }
}

pub(super) fn read_bgra(
    device: &ID3D11Device,
    context: &ID3D11DeviceContext,
    source: &ID3D11Texture2D,
) -> windows::core::Result<Vec<u8>> {
    let mut desc = D3D11_TEXTURE2D_DESC::default();
    // SAFETY: the live COM resource and descriptor pointer remain valid.
    unsafe { source.GetDesc(&mut desc) };
    let row_bytes = (desc.Width as usize).checked_mul(4).ok_or(E_INVALIDARG)?;
    let length = row_bytes
        .checked_mul(desc.Height as usize)
        .filter(|size| *size > 0)
        .ok_or(E_INVALIDARG)?;
    desc.Usage = D3D11_USAGE_STAGING;
    desc.BindFlags = 0;
    desc.CPUAccessFlags = D3D11_CPU_ACCESS_READ.0 as u32;
    desc.MiscFlags = 0;
    let mut texture = None;
    unsafe { device.CreateTexture2D(&desc, None, Some(&mut texture))? };
    let texture = texture.ok_or(E_POINTER)?;
    unsafe { context.CopyResource(&texture, source) };
    let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
    unsafe { context.Map(&texture, 0, D3D11_MAP_READ, 0, Some(&mut mapped))? };
    let _guard = Mapped { context, texture };
    if mapped.pData.is_null() || (mapped.RowPitch as usize) < row_bytes {
        return Err(E_INVALIDARG.into());
    }
    let mut pixels = Vec::new();
    pixels.try_reserve_exact(length).map_err(|_| {
        windows::core::Error::from_hresult(windows::Win32::Foundation::E_OUTOFMEMORY)
    })?;
    for row in 0..desc.Height as usize {
        // SAFETY: successful Map owns Height rows of at least RowPitch bytes;
        // only initialized BGRA pixels are copied while the map guard is alive.
        let start = unsafe {
            mapped
                .pData
                .cast::<u8>()
                .add(row * mapped.RowPitch as usize)
        };
        pixels.extend_from_slice(unsafe { std::slice::from_raw_parts(start, row_bytes) });
    }
    Ok(pixels)
}
