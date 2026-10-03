import { describe, expect, it, vi } from 'vitest';
import { screenshotInserter } from '../screenshot-insert';
const fixture = (canInsert = true) => {
  const options = {
    canInsert: () => canInsert,
    selectClip: vi.fn(),
    shape: vi.fn(),
    image: vi.fn(async () => {}),
    cursor: vi.fn(),
    zoom: vi.fn(),
    effect: vi.fn(),
  };
  return { options, insert: screenshotInserter(options) };
};
describe('screenshot single Add actor', () => {
  it('opens Clip for annotations and delegates each supported kind', async () => {
    const f = fixture();
    for (const kind of ['shape', 'arrow', 'text', 'drawing'] as const) {
      await f.insert(kind);
      expect(f.options.shape).toHaveBeenLastCalledWith(kind);
    }
    expect(f.options.selectClip).toHaveBeenCalledTimes(4);
    await f.insert('image');
    expect(f.options.image).toHaveBeenCalledOnce();
    await f.insert('cursor');
    expect(f.options.cursor).toHaveBeenCalledOnce();
    await f.insert('zoom');
    expect(f.options.zoom).toHaveBeenCalledOnce();
    await f.insert('blur');
    await f.insert('highlight');
    expect(f.options.effect.mock.calls).toEqual([['blur'], ['highlight']]);
  });
  it('does nothing while busy, cropping, unready or fullscreen', async () => {
    const f = fixture(false);
    await f.insert('shape');
    await f.insert('image');
    await f.insert('cursor');
    expect(f.options.selectClip).not.toHaveBeenCalled();
    expect(f.options.image).not.toHaveBeenCalled();
    expect(f.options.cursor).not.toHaveBeenCalled();
  });
  it('rejects unsupported insertion and passes import failures to the caller', async () => {
    const f = fixture();
    await expect(f.insert('video')).rejects.toThrow('Unsupported');
    f.options.image.mockRejectedValueOnce(new Error('Import failed'));
    await expect(f.insert('image')).rejects.toThrow('Import failed');
  });
});
