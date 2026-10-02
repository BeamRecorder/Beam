import type { EngineMetrics } from '../performance/engine-metrics';
import type { GpuTimerExtension } from './gpu-scene-types';

/** Optional hardware timestamps, polled only when rendering. Never gl.finish/readPixels. */
export class GpuTimer {
  private readonly extension: GpuTimerExtension | null;
  private readonly pending: WebGLQuery[] = [];
  private active: WebGLQuery | null = null;
  private readonly gl: WebGL2RenderingContext;
  private readonly metrics: EngineMetrics;
  constructor(gl: WebGL2RenderingContext, metrics: EngineMetrics) {
    this.gl = gl;
    this.metrics = metrics;
    this.extension = gl.getExtension('EXT_disjoint_timer_query_webgl2') as GpuTimerExtension | null;
  }
  begin(): void {
    this.poll();
    if (!this.extension || this.pending.length >= 8 || this.active) return;
    this.active = this.gl.createQuery();
    if (this.active) this.gl.beginQuery(this.extension.TIME_ELAPSED_EXT, this.active);
  }
  end(): void {
    if (!this.active || !this.extension) return;
    this.gl.endQuery(this.extension.TIME_ELAPSED_EXT);
    this.pending.push(this.active);
    this.active = null;
  }
  poll(): void {
    if (!this.extension) return;
    if (this.gl.getParameter(this.extension.GPU_DISJOINT_EXT)) {
      this.clear();
      return;
    }
    while (this.pending.length && this.gl.getQueryParameter(this.pending[0]!, this.gl.QUERY_RESULT_AVAILABLE)) {
      const query = this.pending.shift()!;
      const ns: unknown = this.gl.getQueryParameter(query, this.gl.QUERY_RESULT);
      this.gl.deleteQuery(query);
      if (typeof ns === 'number' && Number.isFinite(ns) && ns >= 0) this.metrics.observe('gpu-execute', ns / 1e6);
    }
  }
  clear(): void {
    if (this.active && this.extension) {
      this.gl.endQuery(this.extension.TIME_ELAPSED_EXT);
      this.gl.deleteQuery(this.active);
      this.active = null;
    }
    for (const query of this.pending.splice(0)) this.gl.deleteQuery(query);
  }
}
