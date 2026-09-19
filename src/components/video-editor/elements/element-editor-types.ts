import type { ComputedRef, Ref } from 'vue';
import type { NormalizedTransform, ShapeClip } from '~/media/shared/composition-types';
import type { ShapeLayerFamily, ShapeLayerStyle } from '~/media/shared/shape-layer-types';
import type { DrawingSettings, DrawnElement } from '~/media/shared/element-types';

export interface ElementEditorOptions {
  layers: () => ShapeClip[];
  selectedId: () => string | null;
  select: (id: string) => void;
  insert: (clip: ShapeClip) => void;
  update: (id: string, patch: Partial<ShapeLayerStyle>) => void;
  remove: (id: string) => void;
  timing: () => { startMs: number; durationMs: number };
  showLayers?: boolean;
  canInteract?: () => boolean;
  addHighlight?: () => void | Promise<void>;
  addBlur?: () => void | Promise<void>;
  addColor?: () => void | Promise<void>;
  addImage?: () => void | Promise<void>;
}
export interface ElementEditorContext {
  canInteract: ComputedRef<boolean>;
  layers: ComputedRef<ShapeClip[]>;
  selected: ComputedRef<ShapeClip | null>;
  editing: Ref<ShapeClip | null>;
  drawingMode: Ref<boolean>;
  drawingSettings: Ref<DrawingSettings>;
  showLayers: boolean;
  add: (family: ShapeLayerFamily) => void;
  addHighlight?: () => void | Promise<void>;
  addBlur?: () => void | Promise<void>;
  addColor?: () => void | Promise<void>;
  addImage?: () => void | Promise<void>;
  addDrawing: (value: DrawnElement) => void;
  updateDrawingSettings: (settings: DrawingSettings) => void;
  select: (id: string) => void;
  update: (patch: Partial<ShapeLayerStyle>) => void;
  remove: () => void;
  beginText: (id: string) => boolean;
  updateText: (content: string) => void;
  finishText: () => void;
  cancelText: () => void;
}
export type ElementViewport = NormalizedTransform;
export interface ElementCamera {
  scale?: number;
  focusX?: number;
  focusY?: number;
  tiltX?: number;
  tiltY?: number;
}
