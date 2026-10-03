export interface BrowserEyeDropper {
  open(options: { signal: AbortSignal }): Promise<{ sRGBHex: string }>;
}

export interface ScreenColorWindow extends Window {
  EyeDropper?: new () => BrowserEyeDropper;
}
