import '~/style.css';
import { createApp, h, nextTick, toRaw, type App, type ComponentPublicInstance } from 'vue';
import { createPinia } from 'pinia';
import { i18n } from '~/i18n';
import type { DesktopCaptureApi, ProjectEditorState } from '~/api/types/capture-api';
import type { PreferenceSettings } from '~/api/types/preferences';
import type { EditorPresetDocument } from '~/api/types/editor-preset';
import type { ShapeClip, VisualClip } from '@beam/engine/shared/composition-types';
import { createDefaultClipAppearance } from '@beam/engine/shared/composition-defaults';
import { DEFAULT_ANNOTATION_SHAPE_STYLE } from '@beam/engine/shared/shape-layer-style';
import { createElementText } from '@beam/engine/shared/element-text';
import { DEFAULT_OUTPUT_CANVAS } from '@beam/engine/layout/output-canvas';
import { createDefaultCursorPresentation } from '@beam/engine/capture/cursor-presentation';
import type { EditorWorkspaceContext } from '../workspace/workspace-types';
import type { SpeechBubbleBrowserHost } from './speech-bubble-browser-types';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(toRaw(value))) as T;

/** Only the Electron boundary is replaced. Workspace, decoding, canvas and timeline remain real. */
export async function mountSpeechBubbleEditor(effects: boolean): Promise<SpeechBubbleBrowserHost> {
  const durationMs = 6000;
  const video: VisualClip = {
    id: 'video',
    trackId: 'video',
    kind: 'video',
    name: 'Video',
    assetId: 'video-asset',
    timelineStartMs: 0,
    timelineDurationMs: durationMs,
    sourceInMs: 0,
    sourceDurationMs: durationMs,
    playbackRate: 1,
    transitions: { entry: null, exit: null },
    enabled: true,
    order: 0,
    transform: { x: 0, y: 0, width: 1, height: 1 },
    crop: { x: 0, y: 0, width: 1, height: 1 },
    appearance: createDefaultClipAppearance('video'),
    isMirrored: false,
    isMirroredY: false,
  };
  const shape: ShapeClip = {
    ...DEFAULT_ANNOTATION_SHAPE_STYLE,
    id: 'bubble',
    trackId: 'bubble',
    kind: 'shape',
    assetId: '',
    name: 'Speech bubble',
    preset: 'speech-bubble',
    fillColor: '#cf4a1d',
    enabled: true,
    order: -1,
    timelineStartMs: 0,
    timelineDurationMs: durationMs,
    sourceInMs: 0,
    sourceDurationMs: durationMs,
    playbackRate: 1,
    transitions: { entry: null, exit: null },
    transform: { x: 0.3, y: 0.3, width: 0.4, height: 0.4 },
    ...(effects ? { opacityEnabled: true, shadowEnabled: true, text: createElementText('Speech bubble') } : {}),
  };
  let saved: ProjectEditorState = {
    schemaVersion: 3,
    composition: {
      schemaVersion: 14,
      keyboardCaptionSessions: [],
      clips: [video, shape],
      assets: [
        {
          id: 'video-asset',
          kind: 'video',
          name: 'Video',
          fileName: 'wispysky.mp4',
          durationMs: 20020,
          width: 1920,
          height: 1080,
          src: '/wallpapers/video/wispysky.mp4',
          origin: 'project',
        },
      ],
    },
    zoom: { elements: [], generatedSessions: [] },
    presentation: {
      canvas: { ...DEFAULT_OUTPUT_CANVAS, width: 1280, height: 720 },
      selectedBackgroundId: null,
      background: null,
      blurPercent: 0,
      importedBackgrounds: [],
      cursor: { ...createDefaultCursorPresentation(), enabled: false },
    },
  };
  const preferences: PreferenceSettings = {
    schemaVersion: 3,
    theme: 'dark',
    devices: {},
    shortcuts: {},
    extras: { locale: 'en' },
    recordingBar: { visibility: 'always' },
    recordingInteractions: { enabled: false, noticeDismissed: true },
    backgroundPresets: { colors: [], gradients: [] },
  };
  let presets: EditorPresetDocument = {
    schemaVersion: 1,
    activePresetId: 'default',
    presets: [
      {
        id: 'default',
        name: 'Default',
        updatedAt: '',
        protected: true,
        settings: {
          editor: { schemaVersion: 1 },
          devices: {},
          export: { format: 'mp4' },
          quickSnip: { automaticZoom: false },
        },
      },
    ],
  };
  const noop = () => {};
  const subscribe = () => noop;
  let saves = 0;
  const host: Partial<DesktopCaptureApi> = {
    platform: 'linux',
    getPreferences: async () => clone(preferences),
    onPreferencesChanged: subscribe,
    updatePreferences: async () => clone(preferences),
    listBackgroundLibrary: async () => [],
    onBackgroundLibraryChanged: subscribe,
    listCursorPacks: async () => [],
    onCursorPacksChanged: subscribe,
    listImportedFonts: async () => [],
    onFontLibraryChanged: subscribe,
    getEditorPresets: async () => clone(presets),
    onEditorPresetsChanged: subscribe,
    updateEditorPreset: async (_id, settings) => {
      presets = { ...presets, presets: [{ ...presets.presets[0]!, settings }] };
      return clone(presets);
    },
    getProjectEditorState: async () => clone(saved),
    saveProjectEditorState: async (_id, state) => {
      saved = clone(state);
      saves++;
      return clone(saved);
    },
    onAuthoringRequest: subscribe,
    registerAuthoringDocument: async () => {},
    replyAuthoringRequest: noop,
    reportEditorLoadingStage: noop,
    onUpdateState: subscribe,
    getUpdateState: async () => ({
      status: 'idle',
      currentVersion: '0.5.1',
      availableVersion: null,
      percent: null,
      message: null,
    }),
    whisperModels: async () => [],
    onWhisperProgress: subscribe,
    onProjectLocationsChanged: subscribe,
    listProjectsPage: async () => ({ projects: [], nextCursor: null, total: 0 }),
  };
  Object.defineProperty(window, 'capture', { configurable: true, value: host });
  const { default: VideoEditor } = await import('../VideoEditor.vue');
  const container = document.createElement('div');
  document.documentElement.classList.add('dark');
  document.body.classList.add('editor-window-root');
  document.body.append(container);
  let workspace: EditorWorkspaceContext;
  let app: App;
  const mount = () => {
    app = createApp({
      render: () =>
        h(VideoEditor, {
          project: {
            id: 'speech-bubble-test',
            name: 'Speech bubble',
            createdAt: '',
            updatedAt: '',
            sessionCount: 0,
            previewSrc: null,
          },
          ref: (component) => {
            if (!component) return;
            const instance = component as ComponentPublicInstance;
            workspace = (instance.$ as unknown as { setupState: { workspace: EditorWorkspaceContext } }).setupState
              .workspace;
          },
        }),
    })
      .use(createPinia())
      .use(i18n);
    app.mount(container);
  };
  mount();
  let frames = 0;
  let frame = 0;
  const tick = () => {
    frames++;
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  const state = () => ({
    ready: workspace.projectStateReady.value,
    settled: workspace.initialPlaybackSettled.value,
    frames,
    saves,
    time: workspace.currentTime.value,
    playback: workspace.playbackState.value,
    error: workspace.playbackError.value,
    shape: clone(
      workspace.composition.value.clips.find(
        (clip): clip is ShapeClip => clip.id === 'bubble' && clip.kind === 'shape',
      )!,
    ),
  });
  return {
    state,
    async select() {
      workspace.selectEditorClip('bubble');
      await nextTick();
    },
    async clear() {
      workspace.compositionState.selectClips([]);
      await nextTick();
    },
    async seek(seconds) {
      await workspace.player.seek(seconds);
      await nextTick();
    },
    async play() {
      await workspace.player.setPlaying(true);
    },
    async pause() {
      await workspace.player.setPlaying(false);
    },
    async undo() {
      await workspace.undo();
      await nextTick();
    },
    async redo() {
      await workspace.redo();
      await nextTick();
    },
    async save() {
      await workspace.editorState.saveNow();
      return clone(saved);
    },
    async reopen() {
      await workspace.editorState.saveNow();
      app.unmount();
      mount();
      await nextTick();
    },
    dispose() {
      cancelAnimationFrame(frame);
      app.unmount();
      container.remove();
    },
  };
}
