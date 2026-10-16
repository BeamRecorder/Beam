const VERTEX = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main(){ gl_Position=vec4(a_position,0.0,1.0);v_uv=(a_position+1.0)*0.5; }`;
const FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D u_sample;
uniform float u_weight;
in vec2 v_uv;
out vec4 color;
void main(){color=texture(u_sample,v_uv)*u_weight;}`;

/** Composite one complete premultiplied cursor exposure, then accumulate normalized samples. */
export class CursorBlurTarget {
  private framebuffer: WebGLFramebuffer | null = null;
  private texture: WebGLTexture | null = null;
  private depth: WebGLRenderbuffer | null = null;
  private program: WebGLProgram | null = null;
  private buffer: WebGLBuffer | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private weight: WebGLUniformLocation | null = null;
  private size = [0, 0];
  private disposed = false;
  private readonly gl: WebGL2RenderingContext;
  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    const shaders: WebGLShader[] = [];
    try {
      this.program = gl.createProgram();
      this.framebuffer = gl.createFramebuffer();
      this.texture = gl.createTexture();
      this.depth = gl.createRenderbuffer();
      this.buffer = gl.createBuffer();
      this.vao = gl.createVertexArray();
      if (!this.program || !this.framebuffer || !this.texture || !this.depth || !this.buffer || !this.vao)
        throw new Error('Cannot allocate cursor exposure target.');
      for (const [type, source] of [
        [gl.VERTEX_SHADER, VERTEX],
        [gl.FRAGMENT_SHADER, FRAGMENT],
      ] as const) {
        const shader = gl.createShader(type);
        if (!shader) throw new Error('Cannot allocate cursor exposure shader.');
        shaders.push(shader);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
          throw new Error(`Cursor exposure shader failed: ${gl.getShaderInfoLog(shader)}`);
        gl.attachShader(this.program, shader);
      }
      gl.linkProgram(this.program);
      if (!gl.getProgramParameter(this.program, gl.LINK_STATUS))
        throw new Error(`Cursor exposure linking failed: ${gl.getProgramInfoLog(this.program)}`);
      gl.bindVertexArray(this.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(this.program, 'a_position');
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      this.weight = gl.getUniformLocation(this.program, 'u_weight');
      gl.useProgram(this.program);
      gl.uniform1i(gl.getUniformLocation(this.program, 'u_sample'), 0);
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    } catch (error) {
      this.dispose();
      throw error;
    } finally {
      for (const shader of shaders) gl.deleteShader(shader);
      gl.bindVertexArray(null);
    }
  }
  begin(width: number, height: number) {
    const gl = this.gl;
    if (this.disposed) throw new Error('Cursor exposure target is disposed.');
    if (this.size[0] !== width || this.size[1] !== height) {
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindRenderbuffer(gl.RENDERBUFFER, this.depth);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, width, height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texture, 0);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.depth);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
        throw new Error('Cursor exposure framebuffer is incomplete.');
      this.size = [width, height];
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }
  accumulate(weight: number) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1f(this.weight, weight);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const gl = this.gl;
    gl.deleteFramebuffer(this.framebuffer);
    gl.deleteTexture(this.texture);
    gl.deleteRenderbuffer(this.depth);
    gl.deleteProgram(this.program);
    gl.deleteBuffer(this.buffer);
    gl.deleteVertexArray(this.vao);
    this.framebuffer = null;
    this.texture = null;
    this.depth = null;
    this.program = null;
    this.buffer = null;
    this.vao = null;
  }
}
