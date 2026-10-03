import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { clearEditorImages, loadEditorImage, requestEditorImage } from './editor-image-cache';

class TestImage {
  static instances: TestImage[] = [];
  static decode: () => Promise<void> = async () => {};
  src = '';
  naturalWidth = 100;
  naturalHeight = 100;
  decode = () => TestImage.decode();
  constructor() {
    TestImage.instances.push(this);
  }
}
beforeEach(() => {
  clearEditorImages();
  TestImage.instances = [];
  TestImage.decode = async () => {};
  vi.stubGlobal('Image', TestImage);
});
afterEach(() => {
  clearEditorImages();
  vi.unstubAllGlobals();
});
it('decodes the same public background once across Screenshot and Video requests', async () => {
  const video = requestEditorImage('/wallpapers/image/desk.png');
  const screenshot = loadEditorImage('./wallpapers/image/desk.png');
  expect(await screenshot).toBe(video.image);
  expect(await loadEditorImage(video.image.src)).toBe(video.image);
  expect(TestImage.instances).toHaveLength(1);
});
it('keeps immutable project-media URLs distinct and retries a failed decode', async () => {
  TestImage.decode = async () => {
    throw new Error('decode failed');
  };
  await expect(loadEditorImage('project-media://screenshot/a/source.png')).rejects.toThrow('decode failed');
  TestImage.decode = async () => {};
  const first = await loadEditorImage('project-media://screenshot/a/source.png');
  expect(await loadEditorImage('project-media://screenshot/b/source.png')).not.toBe(first);
  expect(TestImage.instances).toHaveLength(3);
});
it('clears a closed window cache without blanking images borrowed by painters', async () => {
  const image = await loadEditorImage('data:image/png;base64,AAAA');
  clearEditorImages();
  expect(image.src).toBe('data:image/png;base64,AAAA');
  expect(await loadEditorImage(image.src)).not.toBe(image);
});
