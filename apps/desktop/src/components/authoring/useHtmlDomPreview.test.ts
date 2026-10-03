import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, reactive, shallowRef } from 'vue';
import { htmlPreviewFixture } from './html-dom-preview.fixtures';
import { useHtmlDomPreview } from './useHtmlDomPreview';

const bridge = vi.hoisted(() => ({ getHtmlPreviewSource: vi.fn() }));
vi.mock('~/api/capture', () => ({ capture: bridge }));
const scopes: ReturnType<typeof effectScope>[] = [];
beforeEach(() => {
  vi.useFakeTimers();
  bridge.getHtmlPreviewSource.mockReset().mockResolvedValue('http://localhost/preview');
});
afterEach(() => {
  scopes.splice(0).forEach((scope) => scope.stop());
  vi.useRealTimers();
});
function setup(registered = true, withFrame = true) {
  const fixture = htmlPreviewFixture();
  const props = reactive(fixture.props);
  props.documentReady = registered;
  const target = { postMessage: vi.fn() };
  const frame = shallowRef(withFrame ? ({ contentWindow: target } as unknown as HTMLIFrameElement) : null);
  const scope = effectScope();
  scopes.push(scope);
  const preview = scope.run(() => useHtmlDomPreview(props, frame))!;
  const receive = (data: object, source: unknown = target) =>
    window.dispatchEvent(
      new MessageEvent('message', {
        source: source as Window,
        data: { channel: 'beam-html-preview', previewId: 'html:rev', ...data },
      }),
    );
  return { props, currentTime: fixture.currentTime, target, frame, scope, preview, receive };
}
describe('direct HTML preview clock', () => {
  it('does not request a source until Electron confirms document registration', async () => {
    const f = setup(false);
    await nextTick();
    expect(bridge.getHtmlPreviewSource).not.toHaveBeenCalled();
    expect(f.preview.src.value).toBe('');
    await vi.advanceTimersByTimeAsync(25000);
    expect(f.preview.error.value).toBe('');
    f.props.documentReady = true;
    await nextTick();
    await nextTick();
    expect(bridge.getHtmlPreviewSource).toHaveBeenCalledTimes(1);
    expect(f.preview.src.value).toBe('http://localhost/preview');
  });
  it('uses source time for playback, seeks, playback rate and pause without requesting PNGs', async () => {
    const f = setup();
    await nextTick();
    f.receive({ type: 'ready' });
    expect(f.preview.ready.value).toBe(true);
    f.props.preview.clip.playbackRate = 2;
    f.props.preview.clip.sourceInMs = 200;
    f.currentTime.value = 1.5;
    expect(f.target.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'seek', timeMs: 1200 }), '*');
    f.currentTime.value = 1.2;
    expect(f.target.postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ timeMs: expect.closeTo(600) }),
      '*',
    );
    const count = f.target.postMessage.mock.calls.length;
    await vi.advanceTimersByTimeAsync(1000);
    expect(f.target.postMessage).toHaveBeenCalledTimes(count);
    expect(bridge.getHtmlPreviewSource).toHaveBeenCalledTimes(1);
    f.currentTime.value = 100;
    expect(f.target.postMessage).toHaveBeenCalledTimes(count);
  });
  it('clamps time to the HTML duration and scales at native dimensions', async () => {
    const f = setup();
    await nextTick();
    f.props.preview.html.durationMs = 1000;
    f.currentTime.value = 3;
    expect(f.target.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ timeMs: 1000 }), '*');
    expect(f.preview.iframeStyle.value).toEqual({ width: '1920px', height: '1080px', transform: 'scale(0.5)' });
    f.props.bounds.width = '480px';
    expect(f.preview.iframeStyle.value.transform).toBe('scale(0.25)');
  });
  it('ignores messages from other frames, channels and revisions', async () => {
    const f = setup();
    await nextTick();
    f.receive({ type: 'ready' }, window);
    f.receive({ type: 'ready', channel: 'other' });
    f.receive({ type: 'ready', previewId: 'html:previous' });
    expect(f.preview.ready.value).toBe(false);
    f.receive({ type: 'error', message: 2 });
    expect(f.preview.error.value).toBe('');
    f.receive({ type: 'error', message: 'script failed' });
    expect(f.preview.error.value).toBe('script failed');
    await vi.advanceTimersByTimeAsync(21000);
    expect(f.preview.error.value).toBe('script failed');
  });
  it('reports source failures, registration errors and loading deadlines', async () => {
    bridge.getHtmlPreviewSource.mockRejectedValueOnce(new Error('missing source'));
    const f = setup();
    await nextTick();
    expect(f.preview.error.value).toContain('missing source');
    f.props.preview.html.revision = 'new';
    await nextTick();
    await nextTick();
    expect(f.preview.error.value).toBe('');
    await vi.advanceTimersByTimeAsync(20000);
    expect(f.preview.error.value).toBe('HTML preview timed out.');
    f.props.documentError = 'registration rejected';
    await nextTick();
    expect(f.preview.error.value).toBe('registration rejected');
  });
  it('discards obsolete source requests, including after disposal', async () => {
    let finish!: (url: string) => void;
    bridge.getHtmlPreviewSource.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    );
    const f = setup();
    f.props.preview.html.revision = 'next';
    await nextTick();
    await nextTick();
    finish('old-url');
    await nextTick();
    expect(f.preview.src.value).toBe('http://localhost/preview');
    bridge.getHtmlPreviewSource.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    );
    f.props.preview.html.revision = 'last';
    await nextTick();
    f.scope.stop();
    finish('disposed-url');
    await nextTick();
    expect(f.preview.src.value).toBe('');
  });
  it('ignores obsolete source failures, clears on unregister and removes message listeners', async () => {
    let fail!: (error: Error) => void;
    bridge.getHtmlPreviewSource.mockImplementationOnce(
      () =>
        new Promise<string>((_, reject) => {
          fail = reject;
        }),
    );
    const f = setup(false, false);
    f.preview.sync();
    f.props.documentReady = true;
    await nextTick();
    f.props.documentReady = false;
    await nextTick();
    fail(new Error('obsolete'));
    await nextTick();
    expect(f.preview.error.value).toBe('');
    expect(f.preview.src.value).toBe('');
    f.scope.stop();
    f.receive({ type: 'ready' });
    expect(f.preview.ready.value).toBe(false);
  });
});
