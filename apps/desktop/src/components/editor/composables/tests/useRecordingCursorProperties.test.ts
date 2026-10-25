import { describe, expect, it } from 'vitest';
import { ref, shallowRef } from 'vue';
import { useRecordingCursorProperties } from '../useRecordingCursorProperties';
import { useCursorPropertyFields } from '../../properties/cursor/useCursorPropertyFields';
import { createDefaultCursorPresentation } from '@beam/engine/capture/cursor-presentation';
import { trackPropertyComposition } from '@beam/engine/composition/clip-track-properties.test-support';
import { setScreenCursorVisibility } from '@beam/engine/capture/screen-cursor';
import type { VisualClip } from '@beam/engine/shared/composition-types';

function harness() {
  const composition = shallowRef(trackPropertyComposition()),
    selectedId = ref<string | null>('first'),
    selectedIds = ref(['first']),
    time = ref(0);
  const defaults = ref(createDefaultCursorPresentation());
  const scope = useRecordingCursorProperties({ composition, selectedId, selectedIds, time, defaults });
  return {
    composition,
    selectedId,
    selectedIds,
    time,
    defaults,
    scope,
    fields: useCursorPropertyFields(scope),
    clip: (id: string) => composition.value.clips.find((clip) => clip.id === id) as VisualClip,
  };
}
describe('recording cursor property scope', () => {
  it('edits each clip independently, including all cursor panel fields', () => {
    const h = harness();
    h.fields.cursorSize.value = 90;
    h.fields.cursorColor.value = '#ff0000';
    h.fields.enableShadow.value = false;
    h.fields.shadowBlur.value = 20;
    h.fields.shadowColor.value = '#00ff00';
    h.fields.shadowDirection.value = 'all';
    expect(h.fields.enableShadow.value).toBe(false);
    expect(h.fields.shadowBlur.value).toBe(20);
    expect(h.fields.shadowColor.value).toBe('#00ff00');
    expect(h.fields.shadowDirection.value).toBe('all');
    h.fields.cursorMotion.value = { ...h.fields.cursorMotion.value, smoothing: 0 };
    h.fields.clickEffects.value = {
      ...h.fields.clickEffects.value,
      left: { ...h.fields.clickEffects.value.left, rippleEnabled: true },
    };
    h.fields.cursorAutoHide.value = { enabled: true, delaySeconds: 1, fadeDurationMs: 300 };
    h.fields.cursorSelection.value = { packId: 'custom', mode: 'fixed', cursorId: 'pointer' };
    expect(h.clip('first').cursorSettings).toMatchObject({
      size: 90,
      color: '#ff0000',
      selection: { packId: 'custom' },
      motion: { smoothing: 0 },
      shadow: { enabled: false, blur: 20, color: '#00ff00', direction: 'all' },
    });
    expect(h.clip('second').cursorSettings).toBeUndefined();
    expect(h.defaults.value.size).toBe(45);
    h.selectedId.value = 'second';
    h.selectedIds.value = ['second'];
    expect(h.fields.cursorSize.value).toBe(45);
    h.fields.cursorColor.value = '#0000ff';
    expect(h.clip('first').cursorSettings?.color).toBe('#ff0000');
  });
  it('harmonizes cursor settings and visibility only on the selected recording track', () => {
    const h = harness();
    h.fields.cursorSize.value = 80;
    h.composition.value = setScreenCursorVisibility(h.composition.value, ['first'], false);
    h.scope.enabled.value = true;
    expect(['first', 'second', 'third'].map((id) => h.clip(id).cursorSettings?.size)).toEqual([80, 80, 80]);
    expect(['first', 'second', 'third'].every((id) => h.clip(id).showCursor === false)).toBe(true);
    expect(h.clip('other').cursorSettings).toBeUndefined();
    h.fields.cursorSize.value = 100;
    expect(h.clip('third').cursorSettings?.size).toBe(100);
    h.scope.enabled.value = false;
    h.fields.cursorSize.value = 120;
    expect(h.clip('second').cursorSettings?.size).toBe(100);
  });
  it('applies cursor visibility without copying clip layout or appearance', () => {
    const h = harness();
    h.scope.enabled.value = true;
    const next = setScreenCursorVisibility(h.composition.value, ['first'], false);
    h.composition.value = h.scope.synchronizeVisibility(next);
    expect(h.clip('third').showCursor).toBe(false);
    expect(h.clip('other').showCursor).toBeUndefined();
    h.scope.reset();
    expect(h.scope.enabled.value).toBe(false);
    expect(h.scope.feedback.value).toBeNull();
    expect(h.scope.synchronizeVisibility(h.composition.value)).toBe(h.composition.value);
  });
  it('skips locked peers and makes a locked source read only', () => {
    const h = harness();
    h.composition.value = {
      ...h.composition.value,
      clips: h.composition.value.clips.map((clip) => (clip.id === 'third' ? { ...clip, locked: true } : clip)),
    };
    h.scope.enabled.value = true;
    h.fields.cursorColor.value = '#ff0000';
    expect(h.clip('third').cursorSettings).toBeUndefined();
    expect(h.scope.feedback.value?.clips.map((clip) => clip.id)).toEqual(['first', 'second']);
    h.selectedId.value = 'third';
    h.selectedIds.value = ['third'];
    const before = h.composition.value;
    expect(h.scope.disabled.value).toBe(true);
    h.fields.cursorSize.value = 200;
    expect(h.composition.value).toBe(before);
  });
  it('uses the playhead when no recording is selected and is inert in an empty interval', () => {
    const h = harness();
    h.selectedId.value = null;
    h.selectedIds.value = [];
    h.time.value = 3;
    h.fields.cursorSize.value = 70;
    expect(h.clip('second').cursorSettings?.size).toBe(70);
    h.time.value = 20;
    expect(h.scope.hasTargets.value).toBe(false);
    const before = h.composition.value;
    h.scope.enabled.value = true;
    h.fields.cursorSize.value = 100;
    expect(h.composition.value).toBe(before);
  });
  it('retains per-track scope choices and supports explicit multi-selection across tracks', () => {
    const h = harness();
    h.scope.enabled.value = true;
    h.selectedId.value = 'other';
    h.selectedIds.value = ['other'];
    expect(h.scope.enabled.value).toBe(false);
    h.scope.enabled.value = true;
    expect(h.scope.enabled.value).toBe(false);
    h.selectedId.value = 'first';
    h.selectedIds.value = ['first', 'other'];
    h.fields.cursorColor.value = '#abcdef';
    expect(h.clip('other').cursorSettings?.color).toBe('#abcdef');
    expect(h.clip('third').cursorSettings?.color).toBe('#abcdef');
    expect(h.selectedIds.value).toEqual(['first', 'other']);
  });
});
