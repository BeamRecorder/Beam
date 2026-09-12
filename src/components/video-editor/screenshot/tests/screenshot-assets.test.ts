import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createScreenshotImageLoader } from '../screenshot-assets';

type ImageLike = {
  crossOrigin: string | null;
  src: string;
  decode: ReturnType<typeof vi.fn>;
};

let instances: ImageLike[] = [];
let assignments: string[] = [];
let decodeImage: (image: ImageLike) => Promise<void> = async () => undefined;

class TestImage {
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

  it('keeps at most three decoded URLs and evicts the oldest cache entry', async () => {
    const load = createScreenshotImageLoader();
    const first = await load('source-1.png');
    const second = await load('source-2.png');
    await load('source-3.png');
    expect(await load('source-1.png')).toBe(first);

    await load('source-4.png');
    expect(instances).toHaveLength(4);
    expect(await load('source-2.png')).toBe(second);
    const reloadedFirst = await load('source-1.png');

    expect(instances).toHaveLength(5);
    expect(reloadedFirst).not.toBe(first);
  });

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
