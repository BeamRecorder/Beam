import { describe, expect, it, vi } from 'vitest';
import { createGpuProgram } from '@beam/runtime/gpu/gpu-program';
import { gpuFixture } from '@beam/runtime/gpu/tests/gpu-fixtures';

describe('GPU shader resource setup', () => {
  it('links shaders, retains reusable buffers and releases compiled shaders', () => {
    const { gl } = gpuFixture(),
      result = createGpuProgram(gl);
    expect(result.program).toBeDefined();
    expect(gl.createBuffer).toHaveBeenCalledTimes(2);
    expect(gl.deleteShader).toHaveBeenCalledTimes(2);
    expect(gl.shaderSource).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('u_instanced'));
    expect(result).not.toHaveProperty('direction');
    expect(gl.getUniformLocation).not.toHaveBeenCalledWith(result.program, 'u_direction');
    const source = vi
      .mocked(gl.shaderSource)
      .mock.calls.map(([, shader]) => shader)
      .join('\n');
    expect(source).not.toContain('u_direction');
    expect(source).not.toContain('.227027');
    expect(source).not.toContain('1.384615');
  });
  it('reports shader compilation and linking failures with cleanup', () => {
    const { gl } = gpuFixture();
    vi.mocked(gl.getShaderParameter).mockReturnValueOnce(false);
    expect(() => createGpuProgram(gl)).toThrow('compile failed');
    expect(gl.deleteProgram).toHaveBeenCalledOnce();
    vi.mocked(gl.getProgramParameter).mockReturnValueOnce(false);
    expect(() => createGpuProgram(gl)).toThrow('link failed');
    expect(gl.deleteShader).toHaveBeenCalledTimes(3);
  });
  it('cleans partially allocated buffers and reports each allocation failure', () => {
    for (const method of ['createProgram', 'createShader', 'createBuffer'] as const) {
      const { gl } = gpuFixture();
      vi.mocked(gl[method]).mockImplementationOnce(() => null!);
      expect(() => createGpuProgram(gl)).toThrow('allocate');
    }
    const { gl } = gpuFixture();
    vi.mocked(gl.createBuffer)
      .mockReturnValueOnce({} as WebGLBuffer)
      .mockReturnValueOnce(null as unknown as WebGLBuffer);
    expect(() => createGpuProgram(gl)).toThrow('vertices');
    expect(gl.deleteBuffer).toHaveBeenCalledOnce();
  });
});
