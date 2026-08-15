import { defineComponent, h, nextTick, ref, type Ref } from 'vue';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCanvasBackground } from '../useCanvasBackground';
import type { BackgroundValue } from '../../../composables/backgroundCatalog';

const playback = vi.hoisted(() => {
  const loadCompositionImpl = { current: null as (() => Promise<void>) | null };
  const instances: Array<{
    state: 'paused' | 'loading';
    currentTime: number;
    loadComposition: ReturnType<typeof vi.fn>;
    play: ReturnType<typeof vi.fn>;
    pause: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
    frameFor: ReturnType<typeof vi.fn>;
    listeners: Map<string, (value: unknown) => void>;
    frame: MediaFrameLike | null;
    on: (event: string, listener: (value: unknown) => void) => () => boolean;
    emitFrame: () => void;
  }> = [];
  class FakePlaybackEngine {
    static instances = instances;
    state: 'paused' | 'loading' = 'paused';
    currentTime = 0;
    readonly loadComposition = vi.fn(() => loadCompositionImpl.current?.() ?? Promise.resolve());
    readonly play = vi.fn(async () => undefined);
    readonly pause = vi.fn();
    readonly dispose = vi.fn();
    readonly frameFor = vi.fn(() => this.frame);
    readonly listeners = new Map<string, (value: unknown) => void>();
    frame: MediaFrameLike | null = null;

    constructor() {
      instances.push(this as (typeof instances)[number]);
    }

    on(event: string, listener: (value: unknown) => void) {
      this.listeners.set(event, listener);
      return () => this.listeners.delete(event);
    }

    emitFrame() {
      this.listeners.get('frame')?.({ clipId: 'background-video' });
    }
  }
  return { FakePlaybackEngine, instances, loadCompositionImpl };
});

vi.mock('~/media/playback', () => ({ MediaPlaybackEngine: playback.FakePlaybackEngine }));
vi.mock('~/media/shared', () => ({
  inspectMedia: vi.fn(async () => ({ metadata: { durationSeconds: 4 } })),
  mediaSourceDescriptor: vi.fn((asset: { id: string; kind: string; name: string; src: string }) => ({
    assetId: asset.id,
    kind: asset.kind,
    label: asset.name,
    url: asset.src,
  })),
}));

type MediaFrameLike = {
  bitmap: CanvasImageSource;
  width: number;
  height: number;
  close: ReturnType<typeof vi.fn>;
};

class FakeImage extends EventTarget {
  static instances: FakeImage[] = [];
  naturalWidth = 320;
  naturalHeight = 180;
  src = '';

  constructor() {
    super();
    FakeImage.instances.push(this);
  }
}

const color = (value = '#123456'): BackgroundValue => ({
  id: `color:${value}`,
  name: value,
  kind: 'color',
  color: value,
});

const image = (path = '/wallpapers/image/desk.png'): BackgroundValue => ({
  id: path,
  name: 'Desk',
  path,
  extension: 'png',
  kind: 'image',
});

const video = (path = '/wallpapers/video/loop.mp4'): BackgroundValue => ({
  id: path,
  name: 'Loop',
  path,
  extension: 'mp4',
  kind: 'video',
});

const gradient = (type: 'linear' | 'radial' = 'linear'): BackgroundValue => ({
  id: `gradient:${type}`,
  name: 'Gradient',
  kind: 'gradient',
  gradient: {
    type,
    angle: 45,
    stops: [
      { id: 'a', position: 0, color: '#000000', alpha: 1 },
      { id: 'b', position: 1, color: '#ffffff', alpha: 0.5 },
    ],
  },
});

const context = () =>
  ({
    save: vi.fn(),
    restore: vi.fn(),
    fillRect: vi.fn(),
    drawImage: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    globalAlpha: 1,
    filter: 'none',
    fillStyle: '',
  }) as unknown as CanvasRenderingContext2D;

let wrapper: VueWrapper | undefined;
let selected!: Ref<BackgroundValue | null>;
let blur!: Ref<number | undefined>;
let renderCanvas!: ReturnType<typeof vi.fn>;
let state!: ReturnType<typeof useCanvasBackground>;

const mountComposable = () => {
  selected = ref<BackgroundValue | null>(null);
  blur = ref<number | undefined>(0);
  renderCanvas = vi.fn();
  const Harness = defineComponent({
    setup() {
      state = useCanvasBackground(
        () => selected.value,
        () => blur.value,
        renderCanvas as unknown as () => void,
      );
      return () => h('div');
    },
  });
  wrapper = mount(Harness);
};

beforeEach(() => {
  FakeImage.instances = [];
  playback.instances.length = 0;
  playback.loadCompositionImpl.current = null;
  vi.stubGlobal('Image', FakeImage);
  vi.spyOn(document, 'createElement');
  mountComposable();
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useCanvasBackground', () => {
  it('draws colors, gradients, fallback media, and applies clamped blur', async () => {
    const ctx = context();
    selected.value = color();
    blur.value = 200;
    await nextTick();
    state.drawBackground(ctx, { x: 10, y: 20, width: 100, height: 50 });
    expect(ctx.fillRect).toHaveBeenCalledWith(-86, -76, 292, 242);
    expect(ctx.filter).toBe('blur(48px)');

    selected.value = gradient('linear');
    await nextTick();
    state.drawBackground(ctx, { x: 0, y: 0, width: 100, height: 100 });
    expect(ctx.createLinearGradient).toHaveBeenCalled();

    selected.value = gradient('radial');
    await nextTick();
    state.drawBackground(ctx, { x: 0, y: 0, width: 100, height: 100 });
    expect(ctx.createRadialGradient).toHaveBeenCalled();

    selected.value = image();
    await nextTick();
    state.drawBackground(ctx, { x: 0, y: 0, width: 100, height: 100 });
    expect(ctx.fillRect).toHaveBeenCalled();
    expect(vi.mocked(document.createElement).mock.calls.some(([tag]) => tag === 'video')).toBe(false);
  });

  it('loads images, ignores stale or unloaded images, and reuses the cache', async () => {
    const ctx = context();
    selected.value = image('first.png');
    await nextTick();
    const firstImage = FakeImage.instances[0]!;
    expect(firstImage.src).toBe('http://localhost:3000/first.png');

    renderCanvas.mockClear();
    selected.value = image('second.png');
    await nextTick();
    firstImage.dispatchEvent(new Event('load'));
    expect(renderCanvas).not.toHaveBeenCalled();

    const secondImage = FakeImage.instances[1]!;
    secondImage.naturalWidth = 0;
    secondImage.dispatchEvent(new Event('load'));
    state.drawBackground(ctx, { x: 0, y: 0, width: 100, height: 100 });
    expect(ctx.drawImage).not.toHaveBeenCalled();

    secondImage.naturalWidth = 320;
    secondImage.dispatchEvent(new Event('load'));
    state.drawBackground(ctx, { x: 0, y: 0, width: 100, height: 100 });
    expect(ctx.drawImage).toHaveBeenCalledWith(
      secondImage,
      0,
      0,
      320,
      180,
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
    );

    selected.value = null;
    await nextTick();
    selected.value = image('second.png');
    await nextTick();
    state.drawBackground(ctx, { x: 0, y: 0, width: 100, height: 100 });
    expect(ctx.drawImage).toHaveBeenCalled();
  });

  it('decodes video frames through MediaPlaybackEngine and never creates an HTML video', async () => {
    const ctx = context();
    selected.value = video();
    await flushPromises();
    const engine = playback.instances[0]!;
    expect(engine.loadComposition).toHaveBeenCalledOnce();
    expect(vi.mocked(document.createElement).mock.calls.some(([tag]) => tag === 'video')).toBe(false);

    const bitmap = {} as CanvasImageSource;
    engine.frame = { bitmap, width: 640, height: 360, close: vi.fn() };
    engine.emitFrame();
    state.drawBackground(ctx, { x: 0, y: 0, width: 100, height: 100 });
    expect(ctx.drawImage).toHaveBeenCalledWith(
      bitmap,
      0,
      0,
      640,
      360,
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
    );

    state.syncPlayback(true);
    expect(engine.play).toHaveBeenCalledWith(0);
    state.syncPlayback(false);
    expect(engine.pause).toHaveBeenCalled();
    selected.value = color();
    await nextTick();
    expect(engine.dispose).toHaveBeenCalledOnce();
  });

  it('reports decode failures and disposes the playback engine on unmount', async () => {
    const inspect = await import('~/media/shared');
    vi.mocked(inspect.inspectMedia).mockRejectedValueOnce(new Error('unsupported video'));
    selected.value = video('broken.mp4');
    await flushPromises();
    expect(state.backgroundError.value).toMatchObject({ kind: 'decode-failure', sourceId: 'broken.mp4' });
    expect(playback.instances).toHaveLength(0);
  });

  it('disposes an obsolete background engine when its load rejects after a replacement', async () => {
    let rejectLoad!: (reason: unknown) => void;
    playback.loadCompositionImpl.current = () =>
      new Promise<void>((_resolve, reject) => {
        rejectLoad = reject;
      });

    selected.value = video('stale.mp4');
    await flushPromises();
    expect(playback.instances).toHaveLength(1);
    const staleEngine = playback.instances[0]!;

    selected.value = color();
    await nextTick();
    rejectLoad(new Error('stale background decode failed'));
    await flushPromises();

    expect(staleEngine.dispose).toHaveBeenCalledOnce();
  });
});
