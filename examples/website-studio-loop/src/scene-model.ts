import { createDefaultCaptionStyle } from "../../../packages/engine/src/shared/composition-defaults";
import { validateComposition } from "../../../packages/engine/src/commands/clip-composition-validation";
import { createManualZoom } from "../../../packages/engine/src/zoom/manual-zoom";
import { sourceTimeAt } from "../../../packages/engine/src/shared/timeline-mapping";
import { BACKGROUND_GRADIENTS } from "../../../apps/desktop/src/components/editor/composables/backgroundCatalog";
import type {
  CaptionClip,
  ClipComposition,
  VisualClip,
} from "@beam/engine/shared/composition-types";
import type { CompositionSnapshot } from "@beam/engine/shared/render-document-types";
import type { SelectedClipProperties } from "../../../apps/desktop/src/components/editor/properties/properties-panel-types";
import type { Stage, StudioState } from "./demo-types";
import initial from "../assets/initial.json";
import trimmed from "../assets/trimmed.json";
import split from "../assets/split.json";
import splitAgain from "../assets/split-again.json";
import deleted from "../assets/deleted.json";
import cut from "../assets/cut.json";
import frozen from "../assets/snapshot.json";
import {
  BEATS,
  modeAt,
  phaseTime,
  previewTimeAt,
  progress,
  stageAt,
} from "./motion";
export const CANVAS = { width: 1920, height: 1080 };
export const TRACK_WIDTH = 1088,
  TRACK_LEFT = 144;
export const PREVIEW = { x: 392, y: 108, width: 810, height: 455.625 };
export const TEXT = "Every detail, in focus.";
export const GRADIENTS = BACKGROUND_GRADIENTS.slice(0, 6);
export const OCEAN = GRADIENTS.find(
  (gradient) => gradient.id === "gradient:ocean",
)!;
const fixtures = {
  initial,
  trimmed,
  split,
  "split-again": splitAgain,
  deleted,
  cut,
} as unknown as Record<Stage, ClipComposition>;
Object.values(fixtures).forEach(validateComposition);
export function captionAt(time: number): CaptionClip {
  const t = phaseTime(time),
    text = TEXT.slice(
      0,
      Math.round(TEXT.length * progress(t, BEATS.typeStart, BEATS.typeEnd)),
    );
  return {
    id: "studio-caption",
    name: "Every detail, in focus.",
    kind: "caption",
    enabled: true,
    captionLayerId: "studio-title",
    order: 2,
    timelineStartMs: 3200,
    timelineDurationMs: 4200,
    sourceInMs: 0,
    sourceDurationMs: 4200,
    playbackRate: 1,
    transitions: { entry: null, exit: null },
    caption: {
      type: "text",
      sentences: [
        { id: "studio-sentence", text, startMs: 0, endMs: 4200, words: [] },
      ],
      style: {
        ...createDefaultCaptionStyle(48),
        fontFamily: "Hanken Grotesk",
        customText: text,
        outlineWidth: 0,
        extrusionDepth: 0,
        fontWeight: 800,
        shape: {
          ...createDefaultCaptionStyle().shape,
          color: "#18181b",
          opacity: 88,
          blur: 0,
          padding: 18,
          radius: 16,
        },
      },
    },
  };
}
export function compositionAt(time: number): ClipComposition {
  const t = phaseTime(time),
    base = structuredClone(fixtures[stageAt(t)]);
  const trim = Math.max(
    0,
    Math.min(1, (t - BEATS.trimStart) / (BEATS.trimEnd - BEATS.trimStart)),
  );
  if (stageAt(t) === "initial")
    for (const clip of base.clips) {
      const end = clip.timelineStartMs + clip.timelineDurationMs;
      if (end === 12000) {
        clip.timelineDurationMs -= Math.round(800 * trim);
        clip.sourceDurationMs = clip.timelineDurationMs;
      }
    }
  const size = 1 - 0.14 * progress(t, BEATS.resizeStart, BEATS.resizeEnd);
  for (const clip of base.clips) {
    if (clip.kind === "screen") {
      clip.name = "Quiet Aurora 4";
      clip.transform = {
        x: (1 - size) / 2,
        y: (1 - size) / 2,
        width: size,
        height: size,
      };
      clip.appearance = {
        ...clip.appearance,
        shadowColor: t >= BEATS.shadowColor ? "#6a46e6" : "#17171d",
        shadowSize: "lg",
        shadowBlur: 55,
      };
    }
    if (clip.kind === "webcam") clip.name = "Camera";
  }
  if (t >= BEATS.caption) base.clips.push(captionAt(t));
  return base;
}
export function stateAt(time: number): StudioState {
  return {
    composition: compositionAt(time),
    mode: modeAt(time),
    previewTime: previewTimeAt(time),
    playing: phaseTime(time) >= BEATS.play,
  };
}
export function selectedScreen(time: number): SelectedClipProperties {
  const clip = compositionAt(time).clips.find(
    (clip) =>
      clip.kind === "screen" &&
      sourceTimeAt(clip, previewTimeAt(time) * 1000) !== null,
  )! as VisualClip;
  return {
    id: clip.id,
    kind: clip.kind,
    name: clip.name,
    timelineStartMs: clip.timelineStartMs,
    timelineDurationMs: clip.timelineDurationMs,
    playbackRate: 1,
    clipTransform: clip.transform,
    crop: clip.crop,
    isMirrored: false,
    isMirroredY: false,
    rotation: 0,
    ...clip.appearance,
    cameraLayoutPreset: "custom",
    cameraFramingPreset: "custom",
    hasLinkedScreen: true,
  };
}
export function zoomsAt(time: number) {
  return phaseTime(time) < BEATS.play
    ? []
    : [
        {
          ...createManualZoom("studio-focus", 4800, 7200),
          depth: 2 as const,
          focus: { cx: 0.38, cy: 0.42 },
          mode: "manual" as const,
          projection: "2d" as const,
        },
      ];
}
export function snapshotAt(time: number): CompositionSnapshot {
  const t = phaseTime(time),
    snapshot = structuredClone(frozen) as unknown as CompositionSnapshot;
  snapshot.composition = compositionAt(t);
  snapshot.zooms = zoomsAt(t);
  snapshot.canvas.showBackground = true;
  if (t >= BEATS.ocean)
    snapshot.background = { kind: "gradient", gradient: OCEAN.gradient };
  return snapshot;
}
