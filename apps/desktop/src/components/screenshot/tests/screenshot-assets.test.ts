import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createScreenshotImageLoader } from '@beam/runtime/screenshot/screenshot-image-loader';

type ImageLike = {
  crossOrigin: string | null;
  src: string;
  decode: ReturnType<typeof vi.fn>;
};

let instances: ImageLike[] = [];
let assignments: string[] = [];
let decodeImage: (image: ImageLike) => Promise<void> = async () => undefined;

class TestImage {
  naturalWidth = 100;
  naturalHeight = 100;
  private currentCrossOrigin: string | null = null;
  private currentSrc = '';
  decode = vi.fn(() => decodeImage(this as unknown as ImageLike));

  constructor() {
    instances.push(this as unknown as ImageLike);
  }

  get crossOrigin() {
    return this.currentCrossOrigin;
  }
  set crossOrigin(value: string | null) {
    this.currentCrossOrigin = value;
    assignments.push(`crossOrigin:${value}`);
  }
  get src() {
    return this.currentSrc;
  }
  set src(value: string) {
    this.currentSrc = value;
    assignments.push(`src:${value}`);
  }
}

beforeEach(() => {
  instances = [];
  assignments = [];
  decodeImage = async () => undefined;
  vi.stubGlobal('Image', TestImage);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createScreenshotImageLoader', () => {
  it('does not evict in-flight decodes when a scene requests more than three distinct images', async () => {
    const finish = new Map<string, () => void>();
    decodeImage = (image) => new Promise<void>((resolve) => finish.set(image.src, resolve));
    const load = createScreenshotImageLoader();
    const first = Array.from({ length: 6 }, (_, index) => load(`photo-${index}`));
    const repeated = Array.from({ length: 60 }, (_, index) => load(`photo-${index % 6}`));
    expect(instances).toHaveLength(6);
    repeated.forEach((promise, index) => expect(promise).toBe(first[index % 6]));
    finish.forEach((resolve) => resolve());
    await Promise.all(repeated);
    expect(instances).toHaveLength(6);
  });
  it('shares the same decoded image promise for concurrent and later requests of one URL', async () => {
    let finishDecode!: () => void;
    decodeImage = () => new Promise<void>((resolve) => (finishDecode = resolve));
    const load = createScreenshotImageLoader();

    const first = load('project-media://screenshot/source.png');
    const concurrent = load('project-media://screenshot/source.png');

    expect(concurrent).toBe(first);
    expect(instances).toHaveLength(1);
    expect(instances[0]?.decode).toHaveBeenCalledOnce();
    finishDecode();
    const decoded = await first;
    expect(await load('project-media://screenshot/source.png')).toBe(decoded);
    expect(instances).toHaveLength(1);
  });

  it('sets anonymous CORS before assigning the source URL', async () => {
    const load = createScreenshotImageLoader();

    const image = await load('https://cdn.example.test/source.png');

    expect(assignments).toEqual(['crossOrigin:anonymous', 'src:https://cdn.example.test/source.png']);
    expect(image.crossOrigin).toBe('anonymous');
    expect(image.src).toBe('https://cdn.example.test/source.png');
  });

  it('evicts the least recently used URL at the configured entry bound', async () => {
    const load = createScreenshotImageLoader({ maxEntries: 3 });
    const first = await load('source-1.png');
    const second = await load('source-2.png');
    await load('source-3.png');
    expect(await load('source-1.png')).toBe(first);

    await load('source-4.png');
    expect(instances).toHaveLength(4);
    expect(await load('source-1.png')).toBe(first);
    const reloadedSecond = await load('source-2.png');

    expect(instances).toHaveLength(5);
    expect(reloadedSecond).not.toBe(second);
  });

  it('retains all images of a complex scene across later resource preparations', async () => {
    const load = createScreenshotImageLoader();
    const urls = Array.from({ length: 30 }, (_, index) => `layer-${index}.png`);
    await Promise.all(urls.map(load));
    await Promise.all(urls.map(load));
    expect(instances).toHaveLength(30);
  });
  it('limits retained decoded pixels and does not retain an oversized source', async () => {
    const load = createScreenshotImageLoader({ maxDecodedPixels: 20_000 });
    const first = await load('first');
    await load('second');
    await load('third');
    expect(await load('first')).not.toBe(first);
    const small = createScreenshotImageLoader({ maxDecodedPixels: 100 });
    const large = await small('large');
    expect(await small('large')).not.toBe(large);
  });
  it.each([{ maxEntries: 0 }, { maxEntries: 1.5 }, { maxDecodedPixels: -1 }, { maxDecodedPixels: NaN }])(
    'rejects invalid cache limits %s',
    (options) => {
      expect(() => createScreenshotImageLoader(options)).toThrow('cache limits');
    },
  );

  it('drops a rejected decode from cache so a later request retries', async () => {
    let shouldFail = true;
    decodeImage = async () => {
      if (shouldFail) {
        shouldFail = false;
        throw new Error('decode failed');
      }
    };
    const load = createScreenshotImageLoader();

    await expect(load('broken.png')).rejects.toThrow('decode failed');
    const recovered = await load('broken.png');

    expect(instances).toHaveLength(2);
    expect(instances[0]?.decode).toHaveBeenCalledOnce();
    expect(instances[1]?.decode).toHaveBeenCalledOnce();
    expect(recovered.src).toBe('broken.png');
  });
});
