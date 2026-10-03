import type { ProjectEditorData } from '@beam/engine/capture/capture-session';
import type { ZoomElement } from '@beam/engine/zoom/zoom-types';
import type { ZoomAutoFollowSettings, ZoomMotionBlurSettings } from '@beam/engine/zoom/zoom-types';
import type { ClipComposition } from '@beam/engine/shared/composition-types';
import type { OutputCanvasSettings } from '@beam/engine/layout/output-canvas';
import type { CursorPresentationSettings } from '@beam/engine/capture/cursor-presentation';
import type { CursorPackDescriptor } from '@beam/engine/capture/cursor-pack';
export interface ExportRenderSettings {
  fps: number;
  sourceWidth: number | null;
  sourceHeight: number | null;
}
export type CursorRenderSettings = CursorPresentationSettings;
export interface CompositionSnapshot {
  duration: number;
  render: ExportRenderSettings;
  /** Canvas size used while laying out resolution-dependent overlays in the editor. */
  referenceCanvas?: { width: number; height: number };
  canvas: OutputCanvasSettings;
  background:
    | { kind: 'color'; color: string }
    | { kind: 'gradient'; gradient: import('@beam/engine/shared/background-types').GradientBackground }
    | { kind: 'image' | 'video'; src: string }
    | null;
  blurPercent: number;
  zooms: ZoomElement[];
  zoomMotionBlur?: ZoomMotionBlurSettings;
  zoomAutoFollow?: ZoomAutoFollowSettings;
  cursor: ProjectEditorData['cursor'];
  cursorSettings: CursorRenderSettings;
  cursorPack: CursorPackDescriptor | null;
  composition: ClipComposition;
  /** Host-resolved URLs for imported fonts. Worker code never invents platform URLs. */
  fontSources?: Record<string, string>;
}
