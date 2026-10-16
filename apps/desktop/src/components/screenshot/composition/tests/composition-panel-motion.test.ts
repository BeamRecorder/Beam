import { afterEach, expect, it, vi } from 'vitest';
import { animateCompositionPanel } from '../composition-panel-motion';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});
const setup = () => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false })),
  );
  const panel = document.createElement('aside'),
    surface = document.createElement('div');
  surface.className = 'composition-motion';
  panel.append(surface);
  document.body.append(panel);
  Object.defineProperty(panel, 'offsetWidth', { configurable: true, value: 264 });
  vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue({ width: 330 } as DOMRect);
  vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({ left: 400, top: 6, width: 60, height: 28 } as DOMRect);
  const animation = { cancel: vi.fn() };
  surface.animate = vi.fn(() => animation as unknown as Animation);
  return { panel, surface, animation };
};
it('morphs the surface while leaving pointer-driven panel translation untouched', () => {
  const f = setup();
  f.panel.style.transform = 'translate3d(100px, 200px, 0)';
  expect(animateCompositionPanel(f.panel, { left: 150, top: 256, width: 300, height: 56 })).toBe(f.animation);
  expect(f.surface.animate).toHaveBeenCalledWith(
    [{ transform: 'translate(-200px, 200px) scale(5, 2)' }, { transform: 'translate(0, 0) scale(1, 1)' }],
    { duration: 240, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
  );
  expect(f.panel.style.transform).toBe('translate3d(100px, 200px, 0)');
});
it('honors reduced motion without starting an animation', () => {
  const f = setup();
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  expect(animateCompositionPanel(f.panel, { left: 0, top: 0, width: 264, height: 56 })).toBeNull();
  expect(f.surface.animate).not.toHaveBeenCalled();
});
it('leaves a skeleton or a removed surface alone', () => {
  const f = setup();
  f.surface.remove();
  expect(animateCompositionPanel(f.panel, { left: 0, top: 0, width: 264, height: 56 })).toBeNull();
});
it.each(['source width', 'source height', 'target width', 'target height', 'scale'])(
  'rejects unmeasurable %s instead of producing invalid transforms',
  (kind) => {
    const f = setup(),
      from = { left: 0, top: 0, width: 264, height: 56 };
    if (kind === 'source width') from.width = 0;
    if (kind === 'source height') from.height = 0;
    if (kind === 'target width' || kind === 'target height')
      vi.mocked(f.surface.getBoundingClientRect).mockReturnValue({
        left: 0,
        top: 0,
        width: kind === 'target width' ? 0 : 60,
        height: kind === 'target height' ? 0 : 28,
      } as DOMRect);
    if (kind === 'scale') Object.defineProperty(f.panel, 'offsetWidth', { value: 0 });
    expect(animateCompositionPanel(f.panel, from)).toBeNull();
    expect(f.surface.animate).not.toHaveBeenCalled();
  },
);
