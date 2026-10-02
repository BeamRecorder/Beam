export interface StillEncodeOptions {
  onRendered?(canvas: OffscreenCanvas): Promise<void>;
}
