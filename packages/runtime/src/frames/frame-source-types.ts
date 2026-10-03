import type { RenderableMedia } from '../rendering/render-types';
export interface FrameLease {
  media: RenderableMedia;
  close(): void;
}
export interface FrameSource {
  frameAt(timeMs: number, signal: AbortSignal): Promise<FrameLease>;
}
/** A host capability supplies pixels; documents contain neither framework instances nor executable code. */
export interface HttpFrameSourceDescriptor {
  assetId: string;
  url: string;
}
