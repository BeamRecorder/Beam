import type { GpuUsageSummary } from '../gpu-types';
export interface GpuMonitorOptions {
  processIds(): Promise<number[]> | number[];
  sample(processIds: number[]): Promise<unknown>;
  dispose(): Promise<void>;
  intervalMs?: number;
  clock?: () => number;
}
export interface GpuMonitor {
  snapshot(): GpuUsageSummary;
  finish(): Promise<GpuUsageSummary>;
}
export declare function createGpuMonitor(options: GpuMonitorOptions): GpuMonitor;
export declare function isGpuUsageSample(value: unknown): boolean;
