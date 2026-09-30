import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { completeRecorderStartup, startRecorder } from './recorder-startup';

beforeEach(() => {
  document.body.innerHTML = '<div id="beam-startup" role="status"><span>Beam</span></div><div id="app"></div>';
  history.replaceState({}, '', '/');
  performance.clearMarks();
  performance.clearMeasures();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('recorder startup', () => {
  it('keeps the lightweight shell visible while the renderer is loading', async () => {
    let resolve!: () => void;
    const pending = startRecorder(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    expect(document.getElementById('beam-startup')).not.toBeNull();
    expect(performance.getEntriesByName('beam:bootstrap-start')).toHaveLength(1);
    resolve();
    await pending;
    expect(document.getElementById('beam-startup')).not.toBeNull();
  });
  it.each(['cameraOverlay', 'screenRegion', 'quickSnipCrop', 'teleprompter'])(
    'leaves the %s overlay transparent',
    async (key) => {
      history.replaceState({}, '', `/?${key}=1`);
      const load = vi.fn(async () => undefined);
      await startRecorder(load);
      expect(document.getElementById('beam-startup')).toBeNull();
      expect(load).toHaveBeenCalledOnce();
    },
  );
  it('shows a readable import failure and a retry action without interpreting HTML', async () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { search: '', reload });
    await startRecorder(async () => {
      throw new Error('<img src=x>');
    });
    expect(document.querySelector('[role="alert"]')?.textContent).toBe('<img src=x>');
    expect(document.querySelector('img')).toBeNull();
    expect(document.querySelector('button')?.getAttribute('aria-label')).toBe('Reload Beam');
    expect(document.getElementById('beam-startup')?.hasAttribute('data-error')).toBe(true);
    document.querySelector('button')?.click();
    expect(reload).toHaveBeenCalledOnce();
  });
  it('formats non-Error failures and logs failures after the shell has gone', async () => {
    await startRecorder(async () => {
      throw 'Failed import';
    });
    expect(document.querySelector('[role="alert"]')?.textContent).toBe('Failed import');
    document.getElementById('beam-startup')?.remove();
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    await startRecorder(async () => {
      throw new Error('Gone');
    });
    expect(log).toHaveBeenCalledWith('Beam renderer failed to load:', expect.any(Error));
  });
  it('removes the loading mascot on the next frame without moving it into the titlebar', async () => {
    const logo = document.createElement('img');
    logo.setAttribute('src', '/brand/BeamIcon.webp');
    document.getElementById('app')!.append(logo);
    const animate = vi.fn();
    const portrait = document.createElement('div');
    portrait.dataset.startupMascot = '';
    Object.defineProperty(portrait, 'animate', { value: animate });
    document.getElementById('beam-startup')!.append(portrait);
    document.documentElement.setAttribute('data-beam-startup', '');
    let frame!: FrameRequestCallback;
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        frame = callback;
        return 1;
      }),
    );
    await startRecorder(async () => undefined);
    completeRecorderStartup();
    expect(document.getElementById('beam-startup')).not.toBeNull();
    frame(0);
    expect(document.getElementById('beam-startup')).toBeNull();
    expect(document.documentElement.hasAttribute('data-beam-startup')).toBe(false);
    expect(animate).not.toHaveBeenCalled();
    expect(logo.isConnected).toBe(true);
    expect(logo.getAttribute('src')).toBe('/brand/BeamIcon.webp');
    expect(performance.getEntriesByName('beam:renderer-bootstrap')[0]?.duration).toBeGreaterThanOrEqual(0);
  });
  it('records overlay readiness when its shell was removed before loading', async () => {
    history.replaceState({}, '', '/?screenRegion=1');
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    await startRecorder(async () => undefined);
    completeRecorderStartup();
    expect(document.getElementById('beam-startup')).toBeNull();
    expect(performance.getEntriesByName('beam:renderer-bootstrap')).toHaveLength(1);
  });
  it('tolerates removal of the shell while the first frame is pending', async () => {
    let frame!: FrameRequestCallback;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frame = callback;
      return 1;
    });
    await startRecorder(async () => undefined);
    completeRecorderStartup();
    document.getElementById('beam-startup')?.remove();
    expect(() => frame(0)).not.toThrow();
    expect(performance.getEntriesByName('beam:renderer-bootstrap')).toHaveLength(1);
  });
});
