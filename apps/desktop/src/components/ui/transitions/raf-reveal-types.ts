export interface RevealRuntime {
  requestFrame: (callback: FrameRequestCallback) => number;
  cancelFrame: (id: number) => void;
  now: () => number;
  reducedMotion: () => boolean;
}
export type RevealAxis = 'vertical' | 'horizontal';
export type RevealProperty =
  | 'height'
  | 'width'
  | 'paddingTop'
  | 'paddingBottom'
  | 'paddingLeft'
  | 'paddingRight'
  | 'marginTop'
  | 'marginBottom'
  | 'marginLeft'
  | 'marginRight'
  | 'borderTopWidth'
  | 'borderBottomWidth'
  | 'borderLeftWidth'
  | 'borderRightWidth'
  | 'opacity';
export interface RevealState {
  frame: number | null;
  original: Partial<Record<keyof CSSStyleDeclaration, string>>;
  target: Record<RevealProperty, number>;
  gap: number;
}
