import { describe, it, expect } from 'vitest';
import {
  seekSeconds,
  smooth,
  phaseTime,
  contentOpacity,
  presetState,
  exportState,
  pointerAt,
  CLICKS,
  clipboardState,
} from '../src/motion';
import { capture, setPreset, publishExport, hostState } from '../src/demo-capture';
import { useBeamy, mascotClock } from '../src/mascot-clock';
import { ref } from 'vue';
import type { BeamyPhase } from '../../../apps/desktop/src/components/brand/Beamy/beamy-types';
describe('Seekable Instant demonstrations', () => {
  it.each([-100, NaN, Infinity])('clamps invalid time %s', (ms) => expect(seekSeconds(ms)).toBe(0));
  it.each([
    [0, 0],
    [1800, 1.8],
    [9000, 8],
  ])('clamps %s ms', (ms, s) => expect(seekSeconds(ms)).toBe(s));
  it('uses a bounded easing curve', () => {
    expect(smooth(-1)).toBe(0);
    expect(smooth(0.5)).toBe(0.5);
    expect(smooth(2)).toBe(1);
  });
  it('resets during the hidden loop seam', () => {
    expect(phaseTime(7.59)).toBe(7.59);
    expect(phaseTime(7.6)).toBe(0);
    expect(contentOpacity(0)).toBe(1);
    expect(contentOpacity(7.4)).toBeCloseTo(0.5);
    expect(contentOpacity(7.6)).toBe(0);
    expect(contentOpacity(8)).toBe(1);
  });
  it.each([
    [0, 'default', false, false],
    [0.85, 'default', true, false],
    [1.65, 'default', true, true],
    [2.85, 'nocturne', true, false],
    [4.15, 'nocturne', true, true],
    [5.3, 'sunrise', true, false],
    [8, 'default', false, false],
  ])('replays presets at %s', (t, id, instant, open) =>
    expect(presetState(Number(t))).toEqual({ presetId: id, instant, open }),
  );
  it('completes only after the local rendering sequence', () => {
    expect(exportState(1)).toMatchObject({
      stopped: false,
      completed: false,
      progress: 0,
    });
    expect(exportState(1.15)).toMatchObject({
      stopped: true,
      completed: false,
      progress: 0,
    });
    expect(exportState(3.4).progress).toBeCloseTo(0.5);
    expect(exportState(5.64).completed).toBe(false);
    expect(exportState(5.65)).toMatchObject({
      completed: true,
      progress: 1,
      mascotTime: 0,
    });
    expect(exportState(6.65).mascotTime).toBeCloseTo(1);
    expect(exportState(8)).toEqual(exportState(0));
  });
  it('pastes a draft, sends the video, then shows the replies in order', () => {
    expect(clipboardState(0)).toMatchObject({ pasted: false, sent: false, statusOpacity: 1 });
    expect(clipboardState(2.8)).toMatchObject({ pasted: false, pasteHint: true, statusOpacity: 0 });
    expect(clipboardState(3.3)).toMatchObject({ pasted: true, sent: false, attachmentReveal: 1, pasteHint: false });
    expect(clipboardState(3.8)).toMatchObject({ sent: true, sendReveal: 0 });
    expect(clipboardState(4.2)).toMatchObject({ sendReveal: 1, typing: true, firstReply: 0 });
    expect(clipboardState(4.9)).toMatchObject({ typing: false, firstReply: 1, secondReply: 0 });
    expect(clipboardState(6)).toMatchObject({ firstReply: 1, secondReply: 1 });
    expect(clipboardState(8)).toEqual(clipboardState(0));
  });
  it.each(['presets', 'export', 'clipboard'] as const)('keeps the %s pointer on its native controls', (mode) => {
    for (const click of CLICKS[mode]) {
      const p = pointerAt(mode, click.at);
      expect(p.x).toBeCloseTo(click.x);
      expect(p.y).toBeCloseTo(click.y);
    }
    for (const t of [-1, 0, 0.4, 1.8, 3.2, 6.8, 7.4, 8]) {
      const p = pointerAt(mode, t);
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(640);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(400);
    }
    expect(pointerAt(mode, 8)).toEqual(pointerAt(mode, 0));
  });
});
describe('Native fixture host', () => {
  it('keeps the portable native HUD on macOS without an update side effect', async () => {
    expect(capture.platform).toBe('darwin');
    expect(await capture.getUpdateState()).toEqual({ status: 'idle', currentVersion: '1.0.0', availableVersion: null, percent: null, message: null });
    const off = capture.onUpdateState();
    expect(off()).toBeUndefined();
    expect(off()).toBeUndefined();
  });
  it('delivers saved presets through the desktop API contract', async () => {
    setPreset('default');
    const changes: string[] = [];
    const off = capture.onEditorPresetsChanged((doc) => changes.push(doc.activePresetId));
    expect((await capture.getEditorPresets()).presets).toHaveLength(3);
    await capture.selectEditorPreset('nocturne');
    const nocturne = (await capture.getEditorPresets()).presets.find(preset => preset.id === 'nocturne')!;
    expect(nocturne.settings.editor.presentation?.canvas).toMatchObject({ width: 1280, height: 800 });
    expect(nocturne.settings.editor.visual?.screen?.appearance).toMatchObject({ frame: 'none', cornerRadius: 16 });
    setPreset('nocturne');
    setPreset('sunrise');
    off();
    setPreset('default');
    expect(changes).toEqual(['nocturne', 'sunrise']);
    expect(() => setPreset('unknown')).toThrow('Unknown preset');
  });
  it('publishes a preview and final result without touching real files', async () => {
    const states: string[] = [];
    const off = capture.onQuickSnipStatus((s) => states.push(s.state));
    setPreset('sunrise');
    publishExport(1, 'data:image/webp;base64,fixture', false, 0.5);
    expect(await capture.getQuickSnipState()).toMatchObject({
      state: 'processing',
      preview: 'data:image/webp;base64,fixture',
      result: null,
      progress: 0.5,
      autoClose: null,
      job: { preset: { id: 'sunrise' }, zoomMode: '2d' },
    });
    publishExport(4.5, 'final-preview', true, 1);
    off();
    publishExport(0, 'reset-preview', false, 0);
    expect(states).toEqual(['processing', 'completed']);
    expect(await capture.getQuickSnipRenderTask()).toBeNull();
    capture.onQuickSnipRenderTask(() => {})();
    capture.onQuickSnipStatusBlur(() => {})();
    capture.setQuickSnipStatusInteractive(true);
    capture.notifyQuickSnipStatusReady();
    expect(hostState()).toEqual({ interactive: true, ready: true });
    capture.setQuickSnipStatusInteractive(false);
  });
  it('rejects desktop side effects explicitly', async () => {
    await expect(capture.copyQuickSnipFile()).rejects.toThrow('cannot operate');
    await expect(capture.openQuickSnipEditor()).rejects.toThrow('cannot operate');
    await expect(capture.quickSnipCancel()).rejects.toThrow('cannot operate');
    expect(() => capture.dismissQuickSnipStatus()).toThrow('cannot operate');
  });
  it('samples the real mascot on the film clock', () => {
    const phase = ref<BeamyPhase>('loading'),
      motion = useBeamy(phase, ref(true), ref(0)).motion;
    mascotClock.value = 0;
    const first = JSON.stringify(motion.value);
    mascotClock.value = 1;
    expect(JSON.stringify(motion.value)).not.toBe(first);
    phase.value = 'completed';
    mascotClock.value = 0.5;
    expect(JSON.stringify(motion.value)).not.toBe(first);
    phase.value = 'loading';
    mascotClock.value = 0;
    expect(JSON.stringify(motion.value)).toBe(first);
  });
});

// The portable iframe must carry the real icons without requesting desktop public paths.
import { resolvePublicAssetUrl } from '../src/demo-public-assets';
describe('Portable native capture assets', () => {
  it.each(['recorder', 'screenshot', 'instant'])('freezes the %s icon', (name) => {
    const data = resolvePublicAssetUrl(`/icons/capture/beam-${name}.svg`);
    expect(data).toMatch(/^data:image\/svg\+xml,/);
    expect(decodeURIComponent(data.split(',')[1]!)).toContain('currentColor');
  });
  it('preserves already resolved assets through the native resolver', () => {
    expect(resolvePublicAssetUrl('https://beam.example/art.svg')).toBe('https://beam.example/art.svg');
  });
});
