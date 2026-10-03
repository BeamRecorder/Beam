export interface TimelineFrameHost {
  request(callback: (time: number) => void): number;
  cancel(id: number): void;
}
export interface TimelineFrameQueue {
  request(phase: 'measure' | 'paint', callback: (time: number) => void): number;
  cancel(id: number): void;
  dispose(): void;
}
