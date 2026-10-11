use crate::screen::PixelCrop;
use windows::{
    Win32::{
        Foundation::E_POINTER,
        Graphics::{
            Direct3D::{D3D_PRIMITIVE_TOPOLOGY_TRIANGLELIST, Fxc::D3DCompile, ID3DBlob},
            Direct3D11::*,
        },
    },
    core::{PCSTR, s},
};

pub(super) struct GpuScaler {
    vertex: ID3D11VertexShader,
    pixel: ID3D11PixelShader,
    sampler: ID3D11SamplerState,
    scratch: Option<(u32, u32, ID3D11Texture2D, ID3D11ShaderResourceView)>,
}

fn compile(entry: PCSTR, target: PCSTR) -> windows::core::Result<ID3DBlob> {
    let source = include_bytes!("gpu_scale.hlsl");
    let mut code = None;
    // SAFETY: HLSL is an embedded immutable byte slice and all output pointers
    // refer to live Options. Shader Model 4 works on WGC's D3D11 devices.
    unsafe {
        D3DCompile(
            source.as_ptr().cast(),
            source.len(),
            PCSTR::null(),
            None,
            None,
            entry,
            target,
            0,
            0,
            &mut code,
            None,
        )?
    };
    code.ok_or_else(|| E_POINTER.into())
}

impl GpuScaler {
    pub(super) fn new(device: &ID3D11Device) -> windows::core::Result<Self> {
        let vertex_code = compile(s!("vertex"), s!("vs_4_0"))?;
        let pixel_code = compile(s!("pixel"), s!("ps_4_0"))?;
        let (mut vertex, mut pixel, mut sampler) = (None, None, None);
        // SAFETY: compiled blobs remain alive during creation; the driver copies
        // their bytecode and returns independently owned COM shader objects.
        unsafe {
            device.CreateVertexShader(
                std::slice::from_raw_parts(
                    vertex_code.GetBufferPointer().cast(),
                    vertex_code.GetBufferSize(),
                ),
                None,
                Some(&mut vertex),
            )?;
            device.CreatePixelShader(
                std::slice::from_raw_parts(
                    pixel_code.GetBufferPointer().cast(),
                    pixel_code.GetBufferSize(),
                ),
                None,
                Some(&mut pixel),
            )?;
            device.CreateSamplerState(
                &D3D11_SAMPLER_DESC {
                    Filter: D3D11_FILTER_MIN_MAG_MIP_LINEAR,
                    AddressU: D3D11_TEXTURE_ADDRESS_CLAMP,
                    AddressV: D3D11_TEXTURE_ADDRESS_CLAMP,
                    AddressW: D3D11_TEXTURE_ADDRESS_CLAMP,
                    ComparisonFunc: D3D11_COMPARISON_NEVER,
                    MaxAnisotropy: 1,
                    MaxLOD: f32::MAX,
                    ..Default::default()
                },
                Some(&mut sampler),
            )?;
        }
        Ok(Self {
            vertex: vertex.ok_or(E_POINTER)?,
            pixel: pixel.ok_or(E_POINTER)?,
            sampler: sampler.ok_or(E_POINTER)?,
            scratch: None,
        })
    }

    pub(super) fn draw(
        &mut self,
        device: &ID3D11Device,
        context: &ID3D11DeviceContext,
        source: &ID3D11Texture2D,
        target: &ID3D11Texture2D,
        crop: PixelCrop,
    ) -> windows::core::Result<()> {
        let mut desc = D3D11_TEXTURE2D_DESC::default();
        unsafe { source.GetDesc(&mut desc) };
        let size = (crop.width(), crop.height());
        if self
            .scratch
            .as_ref()
            .is_none_or(|scratch| (scratch.0, scratch.1) != size)
        {
            desc.Width = size.0;
            desc.Height = size.1;
            desc.Usage = D3D11_USAGE_DEFAULT;
            desc.CPUAccessFlags = 0;
            desc.MiscFlags = 0;
            desc.BindFlags = D3D11_BIND_SHADER_RESOURCE.0 as u32;
            let (mut texture, mut view) = (None, None);
            unsafe { device.CreateTexture2D(&desc, None, Some(&mut texture))? };
            let texture = texture.ok_or(E_POINTER)?;
            unsafe { device.CreateShaderResourceView(&texture, None, Some(&mut view))? };
            self.scratch = Some((size.0, size.1, texture, view.ok_or(E_POINTER)?));
        }
        let Some((_, _, scratch, view)) = &self.scratch else {
            return Err(E_POINTER.into());
        };
        let bounds = D3D11_BOX {
            left: crop.start_x,
            top: crop.start_y,
            front: 0,
            right: crop.end_x,
            bottom: crop.end_y,
            back: 1,
        };
        unsafe { context.CopySubresourceRegion(scratch, 0, 0, 0, 0, source, 0, Some(&bounds)) };
        unsafe { target.GetDesc(&mut desc) };
        let scale = (desc.Width as f32 / size.0 as f32).min(desc.Height as f32 / size.1 as f32);
        let (width, height) = (size.0 as f32 * scale, size.1 as f32 * scale);
        let mut output = None;
        unsafe { device.CreateRenderTargetView(target, None, Some(&mut output))? };
        let output = output.ok_or(E_POINTER)?;
        // The capture callback exclusively owns this immediate context. WGC
        // uses copy operations; no renderer shares its graphics pipeline state.
        unsafe {
            context.ClearRenderTargetView(&output, &[0.0, 0.0, 0.0, 1.0]);
            context.OMSetRenderTargets(Some(&[Some(output)]), None);
            context.OMSetBlendState(None, None, u32::MAX);
            context.OMSetDepthStencilState(None, 0);
            context.RSSetState(None);
            context.RSSetViewports(Some(&[D3D11_VIEWPORT {
                TopLeftX: (desc.Width as f32 - width) * 0.5,
                TopLeftY: (desc.Height as f32 - height) * 0.5,
                Width: width,
                Height: height,
                MinDepth: 0.0,
                MaxDepth: 1.0,
            }]));
            context.IASetInputLayout(None);
            context.IASetPrimitiveTopology(D3D_PRIMITIVE_TOPOLOGY_TRIANGLELIST);
            context.VSSetShader(&self.vertex, None);
            context.GSSetShader(None, None);
            context.PSSetShader(&self.pixel, None);
            context.PSSetShaderResources(0, Some(&[Some(view.clone())]));
            context.PSSetSamplers(0, Some(&[Some(self.sampler.clone())]));
            context.Draw(3, 0);
            context.PSSetShaderResources(0, Some(&[None]));
            context.OMSetRenderTargets(None, None);
        }
        Ok(())
    }
}
