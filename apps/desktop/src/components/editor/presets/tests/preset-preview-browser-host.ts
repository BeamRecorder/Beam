import '../../../../style.css';
import '../../layout/editor-layout-tokens.css';
import { createApp, h, nextTick, ref } from 'vue';
import { createPinia } from 'pinia';
import { i18n, initI18n, setCurrentLocale } from '../../../../i18n';
import type { AppLocale } from '../../../../i18n/types';
import type { PresetKind } from '@beam/engine/capture/capture-mode';
import EditorPresetControls from '../../EditorPresetControls.vue';
import CapturePresetSelect from '../../../hud/CapturePresetSelect.vue';
import EditorPresetPreview from '../EditorPresetPreview.vue';
import { useHudPopoverViewport } from '../../../hud/useHudPopoverViewport';
import { previewDocument, previewSettings } from './preset-preview-fixtures';

let active: ReturnType<typeof createApp> | undefined;
const presets = ref(previewDocument());
let commits = 0;
export const committedPreset = () => ({ id: presets.value.activePresetId, commits });

export async function mountPresetPreview(mode: 'instant' | PresetKind | 'pixels', locale: AppLocale, dark = false) {
  active?.unmount();
  await initI18n();
  await setCurrentLocale(locale);
  presets.value = previewDocument();
  commits = 0;
  const image = presets.value.presets[0]!.settings.editor.visual!.image!;
  image.isMirrored = false;
  image.rotation = 0;
  const red = presets.value.presets[1]!.settings;
  red.editor.visual!.image!.rotation = 0;
  red.editor.visual!.screen = { ...red.editor.visual!.image!, isMirrored: false };
  red.editor.presentation!.canvas.watermark!.enabled = true;
  for (let i = 2; i < 12; i++)
    presets.value.presets.push({ ...presets.value.presets[1]!, id: `preset-${i}`, name: `Preset ${i}` });
  const select = (id: string | number) => {
    commits++;
    presets.value = { ...presets.value, activePresetId: String(id) };
  };
  Object.assign(window.capture!, {
    platform: 'linux',
    getEditorPresets: async () => presets.value,
    selectEditorPreset: async (id: string) => {
      select(id);
      return presets.value;
    },
    onEditorPresetsChanged: () => () => {},
  });
  document.documentElement.classList.toggle('dark', dark);
  document.body.style.background = 'var(--color-bg-base)';
  document.body.innerHTML = `<div id="test" style="position:absolute;left:${mode === 'instant' ? 360 : 24}px;top:${mode === 'instant' ? 118 : 24}px;width:${mode === 'instant' ? 240 : 360}px"></div>`;
  active = createApp({
    setup() {
      if (mode === 'instant') useHudPopoverViewport(false);
      return () =>
        mode === 'pixels'
          ? h('div', { class: 'pixel-previews' }, [
              h(EditorPresetPreview, { settings: presets.value.presets[1]!.settings, kind: 'screenshot' }),
              h(EditorPresetPreview, {
                settings: {
                  ...red,
                  editor: {
                    ...red.editor,
                    presentation: {
                      ...red.editor.presentation!,
                      canvas: { ...red.editor.presentation!.canvas, showBackground: false },
                    },
                  },
                },
                kind: 'screenshot',
              }),
              h(EditorPresetPreview, {
                settings: previewSettings({
                  id: 'sky',
                  name: 'Sky',
                  kind: 'video',
                  extension: 'mp4',
                  path: '/wallpapers/video/wispysky.mp4',
                }),
                kind: 'video',
              }),
            ])
          : mode === 'instant'
            ? h(CapturePresetSelect, { kind: 'video', compact: true })
            : h(EditorPresetControls, {
                document: presets.value,
                dirty: false,
                kind: mode,
                previewSource: mode === 'screenshot' ? '/onboarding/alpine-dawn.webp' : undefined,
                onSelect: select,
              });
    },
  });
  active.use(createPinia()).use(i18n).mount('#test');
  await nextTick();
  await document.fonts.ready;
}
