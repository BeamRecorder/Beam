import { defineComponent, h, provide, reactive, ref } from 'vue';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, expect, it, vi } from 'vitest';
import { createDefaultCursorPresentation } from '~/api/types/cursor-presentation';
import type { VisualClip } from '~/media/shared/composition-types';
import { createDefaultClipAppearance } from '~/media/shared/composition-defaults';
import { DEFAULT_OUTPUT_CANVAS } from '../output-canvas';
import type { EditorCanvasProps } from '../editor-canvas-types';
import type { UseCursorOverlayOptions } from './useCursorOverlay';
import { customCursorKey } from '../../properties/cursor/custom-cursor-context';
import { useEditorCanvasCursor } from './useEditorCanvasCursor';

const overlay = vi.hoisted(() => ({ use: vi.fn(), result: { clearCursorBounds: vi.fn() } }));
vi.mock('./useCursorOverlay', () => ({ useCursorOverlay: overlay.use }));
enableAutoUnmount(afterEach);
const create = (provided?: boolean) => {
  const cursor = createDefaultCursorPresentation();
  const props = reactive<EditorCanvasProps>({
    cursorSelection: cursor.selection,
    cursorPack: null,
    cursorSize: cursor.size,
    cursorColor: cursor.color,
    enableShadow: cursor.shadow.enabled,
    shadowBlur: cursor.shadow.blur,
    shadowColor: cursor.shadow.color,
    shadowDirection: cursor.shadow.direction,
    clickEffects: cursor.clickEffects,
    motion: cursor.motion,
    autoHide: cursor.autoHide,
    outputCanvas: { ...DEFAULT_OUTPUT_CANVAS },
    composition: { schemaVersion: 6, clips: [], assets: [], keyboardCaptionSessions: [] },
    isPlaying: false,
    currentTime: 0,
    selectedBackground: null,
    frameFor: () => null,
    frameVersion: 0,
    previewQuality: 'full',
    playbackState: 'paused',
    playbackError: null,
    zoomElements: [],
    selectedZoom: null,
    activeTab: 'cursor',
    selectedTransformClip: null,
  });
  const enabled = ref(provided ?? true);
  const screenClip = ref<VisualClip | null>(null);
  const hasFrame = ref(false);
  const deviceScale = ref(1);
  const renderOnce = vi.fn();
  let result: unknown;
  let options!: UseCursorOverlayOptions;
  overlay.use.mockImplementation((value: UseCursorOverlayOptions) => {
    options = value;
    return overlay.result;
  });
  const Child = defineComponent({
    setup() {
      result = useEditorCanvasCursor(props, {
        screenClip: () => screenClip.value,
        hasScreenFrame: () => hasFrame.value,
        deviceScale: () => deviceScale.value,
        renderOnce,
      });
      return () => h('div');
    },
  });
  mount(
    defineComponent({
      setup() {
        if (provided !== undefined) provide(customCursorKey, enabled);
        return () => h(Child);
      },
    }),
  );
  return { props, enabled, options, result, screenClip, hasFrame, deviceScale, renderOnce };
};

it('defaults to an enabled overlay without an editor context and reads live appearance/playback props', () => {
  const { props, options, result } = create();
  expect(result).toBe(overlay.result);
  expect(options.enabled?.()).toBe(true);
  const keys = [
    'cursorSelection',
    'cursorPack',
    'cursorSize',
    'cursorColor',
    'enableShadow',
    'clickEffects',
    'motion',
    'autoHide',
    'shadowBlur',
    'shadowColor',
    'shadowDirection',
    'outputCanvas',
    'currentTime',
    'isPlaying',
    'editorData',
    'composition',
  ] as const;
  for (const key of keys) expect(options[key]()).toBe(props[key]);
  props.cursorColor = '#123456';
  props.cursorSize = 80;
  props.currentTime = 2;
  props.isPlaying = true;
  props.outputCanvas.showBackground = false;
  expect(options.cursorColor()).toBe('#123456');
  expect(options.cursorSize()).toBe(80);
  expect(options.currentTime()).toBe(2);
  expect(options.isPlaying()).toBe(true);
  expect(options.showBackground()).toBe(false);
});
it('follows the custom cursor titlebar toggle without recreating the overlay', () => {
  const { enabled, options } = create(false);
  expect(options.enabled?.()).toBe(false);
  enabled.value = true;
  expect(options.enabled?.()).toBe(true);
  enabled.value = false;
  expect(options.enabled?.()).toBe(false);
});
it('draws only with a live screen clip and a decoded frame while forwarding scaling and redraws', () => {
  const { options, screenClip, hasFrame, deviceScale, renderOnce } = create(true);
  hasFrame.value = true;
  expect(options.isScreenEnabled()).toBe(false);
  screenClip.value = {
    id: 'screen',
    kind: 'screen',
    name: 'Screen',
    assetId: 'video',
    timelineStartMs: 0,
    timelineDurationMs: 1000,
    sourceInMs: 0,
    sourceDurationMs: 1000,
    playbackRate: 1,
    enabled: true,
    locked: false,
    order: 0,
    isMirrored: false,
    isMirroredY: false,
    transform: { x: 0.5, y: 0.5, width: 1, height: 1 },
    appearance: createDefaultClipAppearance('video'),
  };
  expect(options.isScreenEnabled()).toBe(true);
  expect(options.screenClip()).toBe(screenClip.value);
  hasFrame.value = false;
  expect(options.isScreenEnabled()).toBe(false);
  deviceScale.value = 2;
  expect(options.deviceScale()).toBe(2);
  options.onRenderOnce?.();
  expect(renderOnce).toHaveBeenCalledOnce();
});
