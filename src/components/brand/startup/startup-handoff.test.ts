import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dockStartupMascot } from './startup-handoff';

let startup: HTMLElement;
let source: HTMLElement;
let target: HTMLElement;
let finish: () => void;
let reject: (error: Error) => void;
let cancel: ReturnType<typeof vi.fn>;
let animate: ReturnType<typeof vi.fn>;
let hidden: boolean;
let reduced: boolean;
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};
beforeEach(() => {
  document.body.innerHTML = '<div id="beam-startup"><div data-startup-mascot></div></div><span data-beamy-dock></span>';
  document.documentElement.setAttribute('data-beam-startup', '');
  startup = document.getElementById('beam-startup')!;
  source = startup.firstElementChild as HTMLElement;
  target = document.querySelector('[data-beamy-dock]')!;
  hidden = false;
  reduced = false;
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
  vi.stubGlobal('matchMedia', () => ({ matches: reduced }));
  vi.spyOn(source, 'getBoundingClientRect').mockReturnValue(new DOMRect(200, 30, 184, 184));
  vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(new DOMRect(28, 18, 32, 32));
  const finished = new Promise<void>((resolve, fail) => {
    finish = resolve;
    reject = fail;
  });
  cancel = vi.fn(() => reject(new Error('Cancelled')));
  animate = vi.fn(() => ({ finished, cancel }));
  Object.defineProperty(source, 'animate', { value: animate, configurable: true });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('startup mascot docking', () => {
  it('moves the existing portrait into the measured slot and releases it exactly once', async () => {
    const dispose = vi.fn();
    dockStartupMascot(startup, dispose);
    expect(startup.hasAttribute('data-docking')).toBe(true);
    expect(animate).toHaveBeenCalledWith(
      [{ transform: 'translate(0px, 0px) scale(1)' }, { transform: `translate(-248px, -88px) scale(${32 / 184})` }],
      { duration: 650, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' },
    );
    expect(document.documentElement.hasAttribute('data-beam-startup')).toBe(true);
    finish();
    await flush();
    expect(dispose).toHaveBeenCalledOnce();
    expect(startup.isConnected).toBe(false);
    expect(document.documentElement.hasAttribute('data-beam-startup')).toBe(false);
    window.dispatchEvent(new Event('resize'));
    expect(cancel).not.toHaveBeenCalled();
  });
  it.each(['source', 'target', 'hidden', 'reduced', 'emptySource', 'emptyTarget'])(
    'finishes immediately for %s without animating or delaying readiness',
    (condition) => {
      if (condition === 'source') source.remove();
      if (condition === 'target') target.remove();
      if (condition === 'hidden') hidden = true;
      if (condition === 'reduced') reduced = true;
      if (condition === 'emptySource') vi.mocked(source.getBoundingClientRect).mockReturnValue(new DOMRect());
      if (condition === 'emptyTarget') vi.mocked(target.getBoundingClientRect).mockReturnValue(new DOMRect());
      const dispose = vi.fn();
      dockStartupMascot(startup, dispose);
      expect(dispose).toHaveBeenCalledOnce();
      expect(animate).not.toHaveBeenCalled();
      expect(startup.isConnected).toBe(false);
    },
  );
  it.each(['resize', 'pagehide'])('cancels stale coordinates after %s and cleans both listeners', async (event) => {
    const dispose = vi.fn();
    dockStartupMascot(startup, dispose);
    window.dispatchEvent(new Event(event));
    window.dispatchEvent(new Event(event === 'resize' ? 'pagehide' : 'resize'));
    await flush();
    expect(cancel).toHaveBeenCalledOnce();
    expect(dispose).toHaveBeenCalledOnce();
    expect(startup.isConnected).toBe(false);
  });
  it('reveals the mounted identity if the compositor rejects the animation', async () => {
    const dispose = vi.fn();
    dockStartupMascot(startup, dispose);
    reject(new Error('Interrupted'));
    await flush();
    expect(dispose).toHaveBeenCalledOnce();
    expect(document.documentElement.hasAttribute('data-beam-startup')).toBe(false);
  });
});
