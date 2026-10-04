import { afterEach, expect, it, vi } from 'vitest';
import { editorSkeletonShapes } from './editor-skeleton-shapes';
afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
const rect = (left: number, top: number, width: number, height: number) => new DOMRect(left, top, width, height);
const create = (scale = 1) => {
  const source = document.createElement('div');
  document.body.append(source);
  vi.spyOn(source, 'getBoundingClientRect').mockReturnValue(rect(10, 20, 200 * scale, 100 * scale));
  Object.defineProperty(source, 'offsetWidth', { configurable: true, value: 200 });
  source.innerHTML =
    '<button style="border-radius: 6px"><span class="title">Title</span></button><input><h4>Section</h4>';
  for (const node of source.querySelectorAll<HTMLElement>('*'))
    vi.spyOn(node, 'getBoundingClientRect').mockReturnValue(
      rect(10 + 12 * scale, 20 + 8 * scale, 40 * scale, 24 * scale),
    );
  return source;
};
it.each([1, 0.75, 1.5])(
  'measures the exact control bounds at UI scale %s without counting nested labels twice',
  (scale) => {
    const result = editorSkeletonShapes(create(scale));
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ id: 0, left: 12, top: 8, width: 40, height: 24, radius: '6px' });
  },
);
it('ignores controls hidden by a closed disclosure', () => {
  const source = create();
  vi.mocked(source.querySelector('input')!.getBoundingClientRect).mockReturnValue(rect(0, 0, 0, 0));
  expect(editorSkeletonShapes(source)).toHaveLength(2);
});
it('returns no fabricated geometry when the source has not been laid out yet', () => {
  const source = create();
  vi.mocked(source.getBoundingClientRect).mockReturnValue(rect(0, 0, 0, 0));
  expect(editorSkeletonShapes(source)).toEqual([]);
  vi.mocked(source.getBoundingClientRect).mockReturnValue(rect(0, 0, 200, 100));
  Object.defineProperty(source, 'offsetWidth', { value: 0 });
  expect(editorSkeletonShapes(source)).toEqual([]);
});
it('handles an empty source without making a placeholder row', () => {
  const source = create();
  source.replaceChildren();
  expect(editorSkeletonShapes(source)).toEqual([]);
});
it('includes video time and zoom labels without inventing their widths', () => {
  const source = create();
  source.innerHTML = '<span class="zoom-label">Zoom</span><div class="time-display-container">00:00 / 00:00</div>';
  for (const node of source.children) vi.spyOn(node, 'getBoundingClientRect').mockReturnValue(rect(30, 28, 64, 20));
  const result = editorSkeletonShapes(source);
  expect(result).toHaveLength(2);
  expect(result.map(({ left, top, width, height }) => ({ left, top, width, height }))).toEqual([
    { left: 20, top: 8, width: 64, height: 20 },
    { left: 20, top: 8, width: 64, height: 20 },
  ]);
});
