export interface RevealRuntime {
  requestFrame: (callback: FrameRequestCallback) => number;
  cancelFrame: (id: number) => void;
  now: () => number;
  reducedMotion: () => boolean;
}
export type RevealProperty =
  | 'height'
  | 'paddingTop'
  | 'paddingBottom'
  | 'marginTop'
  | 'marginBottom'
  | 'borderTopWidth'
  | 'borderBottomWidth'
  | 'opacity';
export interface RevealState {
  frame: number | null;
  original: Partial<Record<keyof CSSStyleDeclaration, string>>;
  target: Record<RevealProperty, number>;
  gap: number;
}
