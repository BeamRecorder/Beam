// In-memory host for the real desktop components. This example never calls Electron.
import type { DesktopCaptureApi } from "../../../apps/desktop/src/api/types/capture-api";
import type { EditorPresetDocument } from "../../../apps/desktop/src/api/types/editor-preset";
import { createDefaultCursorPresentation } from "../../../packages/engine/src/capture/cursor-presentation";
import { DEFAULT_OUTPUT_CANVAS } from "../../../packages/engine/src/layout/output-canvas";
import { createDefaultClipAppearance } from "../../../packages/engine/src/shared/composition-defaults";
import type {
  QuickSnipSnapshot,
  QuickSnipRenderTask,
} from "../../../apps/desktop/src/api/types/quick-snip";
const document: EditorPresetDocument = {
  schemaVersion: 1,
  activePresetId: "default",
  presets: ["default", "nocturne", "sunrise"].map((id) => ({
    id,
    name:
      id === "default" ? "Default" : id === "nocturne" ? "Nocturne" : "Sunrise",
    protected: id === "default",
    updatedAt: "2026-10-04T00:00:00.000Z",
    settings: {
      editor: {
        schemaVersion: 1,
        presentation: {
          canvas: { ...DEFAULT_OUTPUT_CANVAS, showBackground: true, ...(id !== 'default' ? { preset: 'custom' as const, width: 1280, height: 800 } : {}) },
          cursor: createDefaultCursorPresentation(),
          selectedBackgroundId: null,
          background: {
            id, name: id, kind: "gradient",
            gradient: {
              type: "linear", angle: 135,
              stops: (id === "sunrise" ? ["#f8b84e", "#ed784c"] : id === "nocturne" ? ["#171727", "#4a3c6f"] : ["#174a62", "#6ab6ae"])
                .map((color, i) => ({id: String(i), color, position: i, alpha: 1})),
            },
          },
        },
        visual: {
          screen: {
            transform: id === 'nocturne' ? { x: 0.12, y: 0.12, width: 0.72, height: 0.72 } : { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
            appearance: { ...createDefaultClipAppearance("screen", true), frame: id === 'nocturne' ? 'none' : "safari", cornerRadius: 16, frameTheme: "dark" },
            isMirrored: false, isMirroredY: false, playbackRate: 1,
            transitions: {entry: null, exit: null}, cameraLayoutPreset: "custom", cameraFramingPreset: "custom",
          },
        },
      },
      devices: {},
      export: { format: "mp4" },
      quickSnip: { automaticZoom: true },
    },
  })),
};
export const demoPresets = document.presets;
const presetListeners = new Set<(document: EditorPresetDocument) => void>();
const statusListeners = new Set<(snapshot: QuickSnipSnapshot) => void>();
const renderListeners = new Set<(task: QuickSnipRenderTask) => void>();
const blurListeners = new Set<() => void>();
let snapshot: QuickSnipSnapshot = {
  state: "idle",
  job: null,
  progress: 0,
  result: null,
  error: null,
};
let interactive = false,
  ready = false;
export function setPreset(id: string) {
  if (!document.presets.some((preset) => preset.id === id))
    throw new Error(`Unknown preset ${id}`);
  if (document.activePresetId === id) return;
  document.activePresetId = id;
  for (const listener of presetListeners) listener({ ...document });
}
export function publishExport(
  time: number,
  preview: string,
  completed: boolean,
  progress: number,
  copied = false,
) {
  snapshot = {
    state: completed ? "completed" : "processing",
    progress,
    preview,
    error: null,
    etaSeconds: Math.max(0, Math.ceil(4.5 - time)),
    autoClose: null,
    copied,
    result: completed
      ? { path: "Beautiful Captures.mp4", projectId: "demo-captures" }
      : null,
    job: {
      mode: "instant",
      format: "mp4",
      name: "Beautiful Captures",
      preset: document.presets.find(preset => preset.id === document.activePresetId)!,
      automaticZoom: true,
      zoomMode: "2d",
      screenKind: "display",
      region: null,
      regionBounds: { x: 0, y: 0, width: 1280, height: 800 },
      displayId: "demo",
      devices: {},
      projectId: "demo-captures",
      thumbnail: preview,
    },
  };
  for (const listener of statusListeners) listener(snapshot);
}
function unavailable(): never {
  throw new Error("This rendered demo cannot operate on desktop files.");
}
export const capture = {
  platform: 'darwin' as const,
  async getUpdateState() {
    return { status: 'idle' as const, currentVersion: '1.0.0', availableVersion: null, percent: null, message: null };
  },
  onUpdateState() { return () => {}; },
  async getEditorPresets() {
    return { ...document };
  },
  async selectEditorPreset(id: string) {
    setPreset(id);
    return { ...document };
  },
  onEditorPresetsChanged(listener) {
    presetListeners.add(listener);
    return () => {
      presetListeners.delete(listener);
    };
  },
  async getQuickSnipState() {
    return snapshot;
  },
  onQuickSnipStatus(listener) {
    statusListeners.add(listener);
    return () => {
      statusListeners.delete(listener);
    };
  },
  async getQuickSnipRenderTask() {
    return null;
  },
  onQuickSnipRenderTask(listener) {
    renderListeners.add(listener);
    return () => {
      renderListeners.delete(listener);
    };
  },
  onQuickSnipStatusBlur(listener) {
    blurListeners.add(listener);
    return () => {
      blurListeners.delete(listener);
    };
  },
  setQuickSnipStatusInteractive(value) {
    interactive = value;
  },
  notifyQuickSnipStatusReady() {
    ready = true;
  },
  async copyQuickSnipFile() {
    return unavailable();
  },
  async openQuickSnipEditor() {
    return unavailable();
  },
  async quickSnipCancel() {
    return unavailable();
  },
  dismissQuickSnipStatus: unavailable,
} satisfies Pick<
  DesktopCaptureApi,
  | "getEditorPresets"
  | "selectEditorPreset"
  | "onEditorPresetsChanged"
  | "getQuickSnipState"
  | "onQuickSnipStatus"
  | "getQuickSnipRenderTask"
  | "onQuickSnipRenderTask"
  | "onQuickSnipStatusBlur"
  | "setQuickSnipStatusInteractive"
  | "notifyQuickSnipStatusReady"
  | "copyQuickSnipFile"
  | "openQuickSnipEditor"
  | "quickSnipCancel"
  | "dismissQuickSnipStatus"
> & Pick<DesktopCaptureApi, 'platform' | 'getUpdateState' | 'onUpdateState'>;
export function hostState() {
  return { interactive, ready };
}
