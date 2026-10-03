import type { Clip, ColorClip, ClipTransition } from '@beam/engine/shared/composition-types';
import type { ZoomElement } from '@beam/engine/zoom/zoom-types';

export interface TimelineCanvasPalette {
  background: string;
  text: string;
  itemText: string;
  border: string;
  selected: string;
  video: string;
  image: string;
  shape: string;
  annotation: string;
  blur: string;
  audio: string;
  zoom: string;
  highlight: string;
  labelBackground: string;
  labelText: string;
  curve: string;
  radius: number;
  tint: number;
  disabledOpacity: number;
}
export type TimelineCanvasItem = (
  | { clip: Clip }
  | { zoom: ZoomElement; label: string }
  | { transition: ClipTransition; edge: 'entry' | 'exit'; label: string }
) & {
  selected: boolean;
  label?: string;
  pasteHighlight?: boolean;
  labelInset?: number;
};
export interface TimelineCanvasFrame {
  mediaSecond?: number;
  relativeMs: number;
  durationMs: number;
  source?: HTMLImageElement;
  pending: boolean;
}
export interface TimelineCanvasArtwork {
  kind: 'thumbnails' | 'image' | 'shape' | 'color';
  frames?: readonly TimelineCanvasFrame[];
  source?: HTMLImageElement;
  fill?: ColorClip['fill'];
  error?: string;
  loading?: boolean;
}
export interface TimelineCanvasMarquee {
  id: string;
  offset: number;
}
