import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { nextTick, reactive } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BackgroundMedia, BackgroundMediaGroup, BackgroundValue } from '../../../composables/backgroundCatalog';
import CanvasPanel from '../CanvasPanel.vue';

const { capture, previewState } = vi.hoisted(() => ({
  capture: {
    getPreferences: vi.fn(),
    updatePreferences: vi.fn(),
    onPreferencesChanged: vi.fn(),
    pickBackgroundLibraryMedia: vi.fn(),
  },
  previewState: {
    previews: {} as Record<string, string>,
    failed: {} as Record<string, boolean>,
    request: vi.fn(),
  },
}));

vi.mock('../../../../../api/capture', () => ({ capture }));
vi.mock('../useBackgroundPreviews', () => ({
  useBackgroundPreviews: () => previewState,
}));

const ComposerStub = {
  props: ['kind', 'color', 'gradient'],
  emits: ['add-color', 'add-gradient', 'update-color', 'update-gradient', 'close'],
  template: `
    <div class="composer-stub">
      <button class="composer-add-color" @click="$emit('add-color', '#abcdef')">add color</button>
      <button class="composer-add-gradient" @click="$emit('add-gradient', gradient)">add gradient</button>
      <button class="composer-close" @click="$emit('close')">close</button>
    </div>
  `,
};

const SwitchStub = {
  props: ['modelValue', 'ariaLabel'],
  emits: ['update:modelValue'],
  template:
    '<button class="switch-stub" type="button" :aria-label="ariaLabel" :data-model-value="String(modelValue)" @click="$emit(\'update:modelValue\', !modelValue)">{{ modelValue }}</button>',
};

const WatermarkControlsStub = {
  template: '<div class="watermark-controls-stub">Watermark</div>',
};

class TestIntersectionObserver {
  static instances: TestIntersectionObserver[] = [];
  readonly callback: IntersectionObserverCallback;
  readonly observe = vi.fn();
  readonly unobserve = vi.fn();
  readonly disconnect = vi.fn();

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    TestIntersectionObserver.instances.push(this);
  }

  trigger(entries: Array<Partial<IntersectionObserverEntry>>) {
    this.callback(entries as IntersectionObserverEntry[], this as unknown as IntersectionObserver);
  }
}

const media = (id: string, kind: 'image' | 'video'): BackgroundMedia => ({
  id,
  name: `${kind} ${id}`,
  path: `/wallpapers/${kind}/${id}.${kind === 'image' ? 'png' : 'mp4'}`,
  extension: kind === 'image' ? 'png' : 'mp4',
  kind,
});

const imageItems = Array.from({ length: 46 }, (_, index) => media(`image-${index}`, 'image'));
const videoItems = [media('video-0', 'video'), media('video-1', 'video')];
const groups: BackgroundMediaGroup[] = [
  { kind: 'image', label: 'Images', items: imageItems },
  { kind: 'video', label: 'Videos', items: videoItems },
];

let wrapper: VueWrapper | undefined;
const originalObserver = globalThis.IntersectionObserver;
let frameCallbacks: Map<number, FrameRequestCallback>;
let nextFrameId: number;
let cancelAnimationFrameMock: ReturnType<typeof vi.fn>;
const reactivePreviews = reactive<Record<string, string>>({});
const reactiveFailed = reactive<Record<string, boolean>>({});

const runNextFrame = async () => {
  const next = frameCallbacks.entries().next();
  if (next.done) return false;
  const [id, callback] = next.value;
  frameCallbacks.delete(id);
  callback(0);
  await nextTick();
  await flushPromises();
  return true;
};

const drainFrames = async () => {
  while (await runNextFrame()) {
    // Drain only work already queued by the component. New user actions must
    // explicitly queue the next frame in each test.
  }
};

const mountPanel = async (
  selectedBackground: BackgroundValue | null = null,
  backgroundGroups = groups,
  showBackground = false,
) => {
  wrapper = mount(CanvasPanel, {
    props: {
      selectedBackground,
      backgroundGroups,
      projectId: 'project-1',
      blurPercent: 20,
      showBackground,
    },
    global: {
      stubs: {
        BackgroundPresetComposer: ComposerStub,
        Switch: SwitchStub,
        WatermarkControls: WatermarkControlsStub,
      },
    },
  });
  await flushPromises();
  await drainFrames();
  return wrapper;
};

beforeEach(() => {
  vi.clearAllMocks();
  TestIntersectionObserver.instances = [];
  frameCallbacks = new Map();
  nextFrameId = 1;
  cancelAnimationFrameMock = vi.fn((id: number) => {
    frameCallbacks.delete(id);
  });
  globalThis.IntersectionObserver = TestIntersectionObserver as unknown as typeof IntersectionObserver;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const id = nextFrameId++;
    frameCallbacks.set(id, callback);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrameMock);
  Object.keys(reactivePreviews).forEach((key) => delete reactivePreviews[key]);
  Object.keys(reactiveFailed).forEach((key) => delete reactiveFailed[key]);
  previewState.previews = reactivePreviews;
  previewState.failed = reactiveFailed;
  capture.getPreferences.mockResolvedValue({
    schemaVersion: 2,
    theme: 'dark',
    recordingBar: { visibility: 'always' },
    alwaysOnTop: true,
    devices: {},
    shortcuts: {},
    backgroundPresets: { colors: [], gradients: [] },
    extras: {},
  });
  capture.updatePreferences.mockResolvedValue({
    backgroundPresets: { colors: [], gradients: [] },
    extras: {},
  });
  capture.onPreferencesChanged.mockReturnValue(vi.fn());
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  if (originalObserver) globalThis.IntersectionObserver = originalObserver;
  else delete (globalThis as { IntersectionObserver?: typeof IntersectionObserver }).IntersectionObserver;
  vi.restoreAllMocks();
});

describe('CanvasPanel', () => {
  it('inverts showBackground for Remove Background and places it before the watermark', async () => {
    const mounted = await mountPanel(imageItems[0], groups, true);
    const removeBackgroundSwitch = mounted!.get('.switch-stub');
    const watermark = mounted!.get('.watermark-controls-stub');

    expect(removeBackgroundSwitch.attributes('aria-label')).toBeTruthy();
    expect(removeBackgroundSwitch.attributes('data-model-value')).toBe('false');
    expect(
      removeBackgroundSwitch.element.compareDocumentPosition(watermark.element) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    await removeBackgroundSwitch.trigger('click');
    expect(mounted!.emitted('update:showBackground')).toEqual([[false]]);
    expect(mounted!.emitted('update:selectedBackground')).toBeUndefined();

    await mounted!.setProps({ showBackground: false });
    expect(mounted!.get('.switch-stub').attributes('data-model-value')).toBe('true');
    await mounted!.get('.switch-stub').trigger('click');
    expect(mounted!.emitted('update:showBackground')).toEqual([[false], [true]]);
  });

  it('shows image skeletons while loading, worker previews when ready, and paths only on failure', async () => {
    previewState.previews['image-0'] = 'blob:image-0';
    previewState.failed['image-1'] = true;
    const mounted = await mountPanel(imageItems[0]);
    const observer = TestIntersectionObserver.instances[0]!;
    const tiles = mounted!.findAll('.media-tile');
    expect(tiles).toHaveLength(15);
    expect(tiles[0]!.classes()).toContain('active');
    expect(tiles[0]!.find('img').attributes('src')).toBe('blob:image-0');
    expect(tiles[0]!.findAll('img')).toHaveLength(1);
    expect(tiles[0]!.attributes('aria-busy')).toBe('false');
    expect(tiles[1]!.find('img').attributes('src')).toContain('image-1.png');
    expect(tiles[1]!.find('img').attributes('loading')).toBe('lazy');
    expect(tiles[1]!.find('img').attributes('decoding')).toBe('async');
    expect(tiles[1]!.attributes('aria-busy')).toBe('false');
    expect(tiles[2]!.find('img').exists()).toBe(false);
    expect(tiles[2]!.find('.skeleton').exists()).toBe(true);
    expect(tiles[2]!.attributes('aria-busy')).toBe('true');
    expect(tiles.every((tile) => tile.findAll('img').length <= 1)).toBe(true);
    expect(observer.observe).toHaveBeenCalled();

    observer.trigger([{ isIntersecting: false, target: tiles[2]!.element }]);
    expect(previewState.request).not.toHaveBeenCalledWith(imageItems[2]);
    observer.trigger([{ isIntersecting: true, target: tiles[2]!.element }]);
    expect(previewState.request).toHaveBeenCalledWith(imageItems[2]);
  });

  it('keeps observer subscriptions stable across selection and preview arrival', async () => {
    const mounted = await mountPanel(imageItems[0]);
    const observer = TestIntersectionObserver.instances[0]!;
    const initialObserveCount = observer.observe.mock.calls.length;
    const initialUnobserveCount = observer.unobserve.mock.calls.length;
    previewState.request.mockClear();

    await mounted!.findAll('.media-tile')[0]!.trigger('click');
    await nextTick();
    expect(mounted!.emitted('update:selectedBackground')).toHaveLength(1);
    expect(previewState.request).not.toHaveBeenCalled();
    expect(observer.observe.mock.calls.length).toBe(initialObserveCount);
    expect(observer.unobserve.mock.calls.length).toBe(initialUnobserveCount);

    reactivePreviews['image-0'] = 'blob:image-0';
    await nextTick();
    expect(mounted!.findAll('.media-tile')[0]!.find('img').attributes('src')).toBe('blob:image-0');
    expect(observer.observe.mock.calls.length).toBe(initialObserveCount);
    expect(observer.unobserve.mock.calls.length).toBe(initialUnobserveCount);
  });

  it('adds one 15-item load-more batch across animation frames', async () => {
    const mounted = await mountPanel();
    const observer = TestIntersectionObserver.instances[0]!;
    const initialObservedCount = observer.observe.mock.calls.length;
    const loadMore = mounted!.get('.load-more button');

    await loadMore.trigger('click');
    await nextTick();
    expect(mounted!.findAll('.media-tile')).toHaveLength(15);

    const frameCounts: number[] = [];
    while (await runNextFrame()) frameCounts.push(mounted!.findAll('.media-tile').length);
    expect(frameCounts.some((count) => count > 15)).toBe(true);
    expect(mounted!.findAll('.media-tile')).toHaveLength(30);
    expect(observer.observe.mock.calls.length).toBe(initialObservedCount + 15);

    await mounted!.get('.load-more button').trigger('click');
    await nextTick();
    await drainFrames();
    expect(mounted!.findAll('.media-tile')).toHaveLength(45);
    expect(observer.observe.mock.calls.length).toBe(initialObservedCount + 30);
  });

  it('coalesces multiple load-more clicks and cancels pending work on unmount', async () => {
    const mounted = await mountPanel();
    const loadMore = mounted!.get('.load-more button');

    await loadMore.trigger('click');
    await loadMore.trigger('click');
    await nextTick();
    expect(mounted!.findAll('.media-tile')).toHaveLength(15);
    await drainFrames();
    expect(mounted!.findAll('.media-tile')).toHaveLength(30);

    await mounted!.get('.load-more button').trigger('click');
    await nextTick();
    expect(frameCallbacks.size).toBeGreaterThan(0);
    mounted!.unmount();
    expect(cancelAnimationFrameMock).toHaveBeenCalled();
    expect(frameCallbacks.size).toBe(0);
  });

  it('switches image/video tabs, renders poster previews without HTML video, and imports by active kind', async () => {
    capture.pickBackgroundLibraryMedia.mockResolvedValueOnce(videoItems[0]);
    const mounted = await mountPanel();
    const tabButtons = mounted!.findAll('.kind-group button');
    await tabButtons[1]!.trigger('click');
    expect(mounted!.findAll('.media-tile')).toHaveLength(2);
    expect(mounted!.findAll('.media-loading-skeleton')).toHaveLength(2);
    expect(mounted!.findAll('.video-placeholder')).toHaveLength(0);
    expect(mounted!.findAll('video')).toHaveLength(0);
    reactivePreviews['video-0'] = 'blob:video-0';
    reactiveFailed['video-1'] = true;
    await nextTick();
    expect(mounted!.findAll('.media-tile')[0]!.find('img').attributes('src')).toBe('blob:video-0');
    expect(mounted!.findAll('.video-placeholder')).toHaveLength(1);
    expect(mounted!.findAll('video')).toHaveLength(0);
    previewState.request.mockClear();
    const observer = TestIntersectionObserver.instances[0]!;
    observer.trigger([{ isIntersecting: true, target: mounted!.findAll('.media-tile')[1]!.element }]);
    expect(previewState.request).toHaveBeenCalledWith(videoItems[1]);
    await mounted!.findAll('.media-tile')[0]!.trigger('mouseenter');
    expect(mounted!.findAll('video')).toHaveLength(0);
    await mounted!.get('.import-btn').trigger('click');
    await flushPromises();
    expect(capture.pickBackgroundLibraryMedia).toHaveBeenCalledWith('video');
    expect(mounted!.emitted('import:background')).toEqual([[videoItems[0]]]);

    await tabButtons[1]!.trigger('click');
    expect(mounted!.findAll('.media-tile')).toHaveLength(2);
  });

  it('shows empty media states and imports a generic background from color or gradient tabs', async () => {
    capture.pickBackgroundLibraryMedia.mockResolvedValueOnce(undefined);
    const mounted = await mountPanel(null, [{ kind: 'video', label: 'Videos', items: videoItems }]);
    expect(mounted!.find('.empty-backgrounds').exists()).toBe(true);
    await mounted!.get('.empty-backgrounds button').trigger('click');
    expect(capture.pickBackgroundLibraryMedia).toHaveBeenCalledWith('image');

    const tabs = mounted!.findAll('.kind-group button');
    await tabs[2]!.trigger('click');
    expect(mounted!.find('.swatches-section').exists()).toBe(true);
    expect(mounted!.findAll('.swatch-tile').length).toBeGreaterThan(1);
    await mounted!.find('.swatch-tile:not(.custom-add-tile)').trigger('click');
    expect(mounted!.emitted('update:selectedBackground')).toBeTruthy();

    await tabs[3]!.trigger('click');
    expect(mounted!.find('.gradients-section').exists()).toBe(true);
    expect(mounted!.findAll('.swatch-tile').length).toBeGreaterThan(1);
    await mounted!.find('.swatch-tile:not(.custom-add-tile)').trigger('click');
    expect(mounted!.emitted('update:selectedBackground')).toHaveLength(2);
    await mounted!.get('.import-btn').trigger('click');
    await flushPromises();
    expect(capture.pickBackgroundLibraryMedia).toHaveBeenLastCalledWith('media');
  });

  it('edits selected presets and forwards blur slider interactions', async () => {
    const selectedColor = { id: 'color:#111827', name: '#111827', kind: 'color' as const, color: '#111827' };
    const mounted = await mountPanel(selectedColor);
    const tabs = mounted!.findAll('.kind-group button');
    await tabs[2]!.trigger('click');
    expect(mounted!.find('.edit-selected-preset').exists()).toBe(true);
    await mounted!.get('.edit-selected-preset').trigger('click');
    await flushPromises();
    expect(document.body.querySelector('.composer-stub')).not.toBeNull();

    (document.body.querySelector('.composer-add-color') as HTMLButtonElement).click();
    await flushPromises();
    expect(capture.updatePreferences).toHaveBeenCalled();
    expect(mounted!.emitted('update:selectedBackground')).toBeTruthy();

    const slider = mounted!.get('.big-slider-input');
    await slider.setValue('55');
    await slider.trigger('pointerdown');
    await slider.trigger('change');
    expect(mounted!.emitted('update:blurPercent')?.at(-1)).toEqual([55]);
  });
});
