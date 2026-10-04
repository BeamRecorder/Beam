import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h, ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createComposition } from '@beam/engine/commands/clip-engine';
import { createDefaultClipAppearance } from '@beam/engine/shared/composition-defaults';
import type { MediaAsset, VisualClip } from '@beam/engine/shared/composition-types';
import { i18n, setCurrentLocale } from '~/i18n';
import { SUPPORTED_LOCALES } from '~/i18n/locales';
import { provideEditorWorkspace } from '../../workspace/workspace-context';
import type { EditorWorkspaceContext } from '../../workspace/workspace-types';
import { normalizeEditorPreferenceDefaults } from '../../composables/editor-defaults';
import EditorDeveloperSettings from './EditorDeveloperSettings.vue';
const capture = vi.hoisted(() => ({ importDroppedProjectMedia: vi.fn() }));
const inspect = vi.hoisted(() => ({ inspectDroppedMedia: vi.fn() }));
vi.mock('~/api/capture', () => ({ capture }));
vi.mock('@beam/runtime/shared/dropped-media', () => inspect);
enableAutoUnmount(afterEach);
const asset: MediaAsset = {
  id: 'screen-asset',
  kind: 'video',
  name: 'Screen',
  fileName: null,
  src: 'screen.mp4',
  width: 1920,
  height: 1080,
  durationMs: 8000,
  origin: 'session',
  sessionId: 'session',
};
const screen: VisualClip = {
  id: 'screen',
  kind: 'screen',
  name: 'Screen',
  assetId: asset.id,
  trackId: 'screen',
  timelineStartMs: 0,
  timelineDurationMs: 8000,
  sourceInMs: 0,
  sourceDurationMs: 8000,
  playbackRate: 1,
  transitions: { entry: null, exit: null },
  enabled: true,
  order: 0,
  transform: { x: 0, y: 0, width: 1, height: 1 },
  appearance: createDefaultClipAppearance('screen'),
  isMirrored: false,
  isMirroredY: false,
};
const create = (hideRecorder = false, empty = false, missingProject = false) => {
  const composition = ref(empty ? createComposition() : createComposition([asset], [screen]));
  const commitNow = vi.fn();
  const context = {
    composition,
    props: { project: missingProject ? null : { id: 'project' } },
    selectedClipId: ref('screen'),
    currentTime: ref(0),
    editorDefaults: ref(normalizeEditorPreferenceDefaults(undefined)),
    commitNow,
    createEditorSnapshot: () => ({ composition: composition.value }),
  };
  const wrapper = mount(
    defineComponent({
      setup() {
        provideEditorWorkspace(context as unknown as EditorWorkspaceContext);
        return () => h(EditorDeveloperSettings, { hideRecorder });
      },
    }),
  );
  return { wrapper, composition, commitNow };
};
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(['demo']) }));
  inspect.inspectDroppedMedia.mockResolvedValue({ kind: 'video', durationMs: 8000, width: 640, height: 360 });
  capture.importDroppedProjectMedia.mockResolvedValue({ ...asset, id: 'import', origin: 'project' });
});
afterEach(() => vi.unstubAllGlobals());

describe('demo webcam developer setting', () => {
  it('appears at the end of enabled video developer tools and commits the added webcam through history', async () => {
    const { wrapper, composition, commitNow } = create();
    expect(wrapper.find('.fake-webcam-action').exists()).toBe(false);
    await wrapper.get('[role="switch"]').trigger('click');
    const action = wrapper.get('.fake-webcam-action');
    expect(action.get('button').text()).toBe('Add fake webcam overlay');
    expect(action.element.parentElement?.lastElementChild).toBe(action.element);
    await action.get('button').trigger('click');
    await flushPromises();
    expect(composition.value.clips.find((clip) => clip.kind === 'webcam')).toMatchObject({
      recordingClipId: 'screen',
      reactToZoom: true,
    });
    expect(commitNow).toHaveBeenCalledWith({ composition: composition.value });
    expect(action.get('button').attributes('disabled')).toBeDefined();
  });
  it('stays hidden in screenshot developer tools and explains missing recordings', () => {
    localStorage.setItem('dev_mode_enabled', 'true');
    expect(create(true).wrapper.find('.fake-webcam-action').exists()).toBe(false);
    expect(create(false, false, true).wrapper.get('.fake-webcam-action button').attributes('disabled')).toBeDefined();
    const { wrapper } = create(false, true);
    expect(wrapper.get('.fake-webcam-action button').attributes('disabled')).toBeDefined();
    expect(wrapper.get('.fake-webcam-action').text()).toContain('Add a screen recording first.');
  });
  it('leaves DevTools activation harmless when the preload does not expose the optional method', async () => {
    localStorage.setItem('dev_mode_enabled', 'true');
    const { wrapper } = create();
    const button = wrapper
      .findAll('.dev-action-btn')
      .find((control) => control.text() === i18n.global.t('SettingsPanel.openDevTools'))!;
    await button.trigger('click');
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });
  it('shows a translated failure and leaves the project untouched', async () => {
    localStorage.setItem('dev_mode_enabled', 'true');
    vi.mocked(fetch).mockRejectedValueOnce(new Error('unavailable'));
    const { wrapper, composition, commitNow } = create();
    await wrapper.get('.fake-webcam-action button').trigger('click');
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe('Could not add the demo webcam.');
    expect(composition.value.clips).toHaveLength(1);
    expect(commitNow).not.toHaveBeenCalled();
  });
  it.each(SUPPORTED_LOCALES)('translates the action, description and disabled explanation in %s', async (locale) => {
    await setCurrentLocale(locale);
    localStorage.setItem('dev_mode_enabled', 'true');
    const { wrapper } = create(false, true);
    for (const key of ['fakeWebcamTitle', 'addFakeWebcamOverlay', 'fakeWebcamDescription', 'fakeWebcamNoRecording']) {
      const label = i18n.global.t(`SettingsPanel.${key}`);
      expect(label).not.toBe(`SettingsPanel.${key}`);
      expect(wrapper.get('.fake-webcam-action').text()).toContain(label);
    }
  });
});
