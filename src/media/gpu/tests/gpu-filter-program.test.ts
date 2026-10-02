import { describe, expect, it, vi } from 'vitest';
import { createGpuFilterFramebuffer, createGpuFilterProgram, createGpuFilterTarget } from '../gpu-filter-program';
import { gpuFilterFixture } from './gpu-filter.test-support';

describe('GPU filter program', () => {
  it('links a buffer-free fullscreen triangle and normalized Gaussian uniforms', () => {
    const { gl } = gpuFilterFixture();
    const program = createGpuFilterProgram(gl);
    expect(program.vao).toBeDefined();
    expect(Object.keys(program.uniforms)).toHaveLength(15);
    expect(gl.createBuffer).not.toHaveBeenCalled();
    expect(gl.deleteShader).toHaveBeenCalledTimes(2);
    expect(gl.shaderSource).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('u_weights[6]'));
    expect(gl.shaderSource).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('gl_VertexID'));
    expect(gl.shaderSource).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('texelFetch'));
  });

  it('uses an explicitly rasterized outside-highlight mask without changing its antialiased coverage', () => {
    const { gl } = gpuFilterFixture();
    createGpuFilterProgram(gl);
    const fragment = vi.mocked(gl.shaderSource).mock.calls[1]?.[1] ?? '';
    const outside = fragment.match(/u_mode\s*==\s*7\)\s*\{([^}]+)\}/)?.[1];
    expect(outside).toBeDefined();
    expect(outside).toMatch(/vec4\(u_tint\.rgb\s*\*\s*u_tint\.a,\s*u_tint\.a\)\s*\*\s*mask/);
    expect(outside).not.toMatch(/1\.?\s*-\s*mask/);
    expect(outside).toContain('return;');
  });

  it('samples transparent pixels when a pixelation cell center lies outside the source', () => {
    const { gl } = gpuFilterFixture();
    createGpuFilterProgram(gl);
    const fragment = vi.mocked(gl.shaderSource).mock.calls[1]?.[1] ?? '';
    expect(fragment).toMatch(/inside\s*&&\s*all\(greaterThanEqual\(q,\s*vec2\(0\.\)\)\)/);
    expect(fragment).toMatch(/&&\s*all\(lessThan\(q,\s*vec2\(1\.\)\)\)\s*\?\s*texelFetch/);
    expect(fragment).toMatch(/texelFetch\([^;]+\)\s*:\s*vec4\(0\.\)/);
  });

  it('maps pixelation cell centers through the actual cropped texture coordinates', () => {
    const { gl } = gpuFilterFixture();
    createGpuFilterProgram(gl);
    const fragment = vi.mocked(gl.shaderSource).mock.calls[1]?.[1] ?? '';
    expect(fragment).toMatch(/sampled\s*=\s*u_uvRect\.xy\s*\+\s*vec2\(q\.x,\s*1\.\s*-\s*q\.y\)\s*\*\s*u_uvRect\.zw/);
    expect(fragment).toMatch(/pixel\s*=\s*ivec2\(floor\(sampled\s*\*\s*vec2\(dimensions\)\)\)/);
  });

  it.each(['createProgram', 'createVertexArray'] as const)('cleans partial allocation when %s fails', (method) => {
    const { gl } = gpuFilterFixture();
    vi.mocked(gl[method]).mockReturnValueOnce(null!);
    expect(() => createGpuFilterProgram(gl)).toThrow('allocation failed');
    expect(gl.deleteProgram).toHaveBeenCalledTimes(method === 'createProgram' ? 0 : 1);
    expect(gl.deleteVertexArray).toHaveBeenCalledTimes(method === 'createVertexArray' ? 0 : 1);
    expect(gl.createShader).not.toHaveBeenCalled();
  });

  it('handles simultaneous program and vertex-array allocation failures', () => {
    const { gl } = gpuFilterFixture();
    vi.mocked(gl.createProgram).mockReturnValueOnce(null!);
    vi.mocked(gl.createVertexArray).mockReturnValueOnce(null!);
    expect(() => createGpuFilterProgram(gl)).toThrow('allocation failed');
    expect(gl.deleteProgram).not.toHaveBeenCalled();
    expect(gl.deleteVertexArray).not.toHaveBeenCalled();
  });

  it.each(['allocate', 'compile', 'link'] as const)('cleans shader, VAO and program after %s failure', (failure) => {
    const { gl } = gpuFilterFixture();
    if (failure === 'allocate') vi.mocked(gl.createShader).mockReturnValueOnce(null!);
    if (failure === 'compile') vi.mocked(gl.getShaderParameter).mockReturnValueOnce(false);
    if (failure === 'link') vi.mocked(gl.getProgramParameter).mockReturnValueOnce(false);
    expect(() => createGpuFilterProgram(gl)).toThrow(
      failure === 'allocate' ? 'shader allocation' : `${failure} failed`,
    );
    expect(gl.deleteProgram).toHaveBeenCalledOnce();
    expect(gl.deleteVertexArray).toHaveBeenCalledOnce();
    expect(gl.deleteShader).toHaveBeenCalledTimes(failure === 'allocate' ? 0 : failure === 'compile' ? 1 : 2);
  });
});

describe('GPU filter target', () => {
  it('allocates a linear, edge-clamped transparent RGBA target at its actual size', () => {
    const { gl } = gpuFilterFixture();
    const result = createGpuFilterTarget(gl, 17, 9);
    expect(result).toMatchObject({ width: 17, height: 9 });
    expect(gl.texStorage2D).toHaveBeenCalledWith(gl.TEXTURE_2D, 1, gl.RGBA8, 17, 9);
    expect(gl.texImage2D).not.toHaveBeenCalled();
    expect(gl.texParameteri).toHaveBeenCalledWith(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    expect(gl.texParameteri).toHaveBeenCalledWith(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  });

  it('reports allocation failure without attempting upload', () => {
    const { gl } = gpuFilterFixture();
    vi.mocked(gl.createTexture).mockReturnValueOnce(null!);
    expect(() => createGpuFilterTarget(gl, 1, 1)).toThrow('texture allocation');
    expect(gl.texStorage2D).not.toHaveBeenCalled();
  });

  it.each(['texParameteri', 'texStorage2D'] as const)('releases its texture when %s throws', (method) => {
    const { gl } = gpuFilterFixture();
    vi.mocked(gl[method]).mockImplementationOnce(() => {
      throw new Error('GPU allocation failed');
    });
    expect(() => createGpuFilterTarget(gl, 1, 1)).toThrow('GPU allocation failed');
    expect(gl.deleteTexture).toHaveBeenCalledOnce();
  });
});

describe('GPU framebuffer initialization contract', () => {
  it('validates immutable RGBA8 once, detaches and frees its probe before returning', () => {
    const { gl } = gpuFilterFixture();
    const framebuffer = createGpuFilterFramebuffer(gl);
    expect(gl.texStorage2D).toHaveBeenCalledWith(gl.TEXTURE_2D, 1, gl.RGBA8, 1, 1);
    expect(gl.checkFramebufferStatus).toHaveBeenCalledOnce();
    expect(gl.framebufferTexture2D).toHaveBeenLastCalledWith(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      null,
      0,
    );
    expect(gl.deleteTexture).toHaveBeenCalledOnce();
    expect(gl.deleteFramebuffer).not.toHaveBeenCalled();
    expect(gl.bindFramebuffer).toHaveBeenLastCalledWith(gl.FRAMEBUFFER, null);
    expect(framebuffer).toBeDefined();
  });

  it('rejects an unsupported framebuffer format and releases the probe and framebuffer', () => {
    const { gl } = gpuFilterFixture();
    vi.mocked(gl.checkFramebufferStatus).mockReturnValueOnce(0);
    expect(() => createGpuFilterFramebuffer(gl)).toThrow('incomplete');
    expect(gl.deleteTexture).toHaveBeenCalledOnce();
    expect(gl.deleteFramebuffer).toHaveBeenCalledOnce();
    expect(gl.bindFramebuffer).toHaveBeenLastCalledWith(gl.FRAMEBUFFER, null);
  });

  it('reports framebuffer allocation failure without allocating a probe', () => {
    const { gl } = gpuFilterFixture();
    vi.mocked(gl.createFramebuffer).mockReturnValueOnce(null!);
    expect(() => createGpuFilterFramebuffer(gl)).toThrow('framebuffer allocation');
    expect(gl.createTexture).not.toHaveBeenCalled();
    expect(gl.checkFramebufferStatus).not.toHaveBeenCalled();
  });

  it('releases the framebuffer when probe allocation fails', () => {
    const { gl } = gpuFilterFixture();
    vi.mocked(gl.createTexture).mockReturnValueOnce(null!);
    expect(() => createGpuFilterFramebuffer(gl)).toThrow('texture allocation');
    expect(gl.deleteFramebuffer).toHaveBeenCalledOnce();
    expect(gl.deleteTexture).not.toHaveBeenCalled();
    expect(gl.bindFramebuffer).toHaveBeenLastCalledWith(gl.FRAMEBUFFER, null);
  });

  it.each(['texStorage2D', 'framebufferTexture2D', 'checkFramebufferStatus'] as const)(
    'releases partial resources and unbinds on %s failure',
    (method) => {
      const { gl } = gpuFilterFixture();
      vi.mocked(gl[method]).mockImplementationOnce(() => {
        throw new Error('GPU initialization failed');
      });
      expect(() => createGpuFilterFramebuffer(gl)).toThrow('GPU initialization failed');
      expect(gl.deleteTexture).toHaveBeenCalledOnce();
      expect(gl.deleteFramebuffer).toHaveBeenCalledOnce();
      expect(gl.bindFramebuffer).toHaveBeenLastCalledWith(gl.FRAMEBUFFER, null);
    },
  );
});
