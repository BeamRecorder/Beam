import { defineComponent, h, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import type { CaptureProject, ProjectEditorData } from '../../../../api/types/capture-api';
import { normalizeEditorPreferenceDefaults } from '../editor-defaults';
import { useClipComposition } from '../useClipComposition';

vi.mock('../../../../api/capture', () => ({ capture: { pickProjectMedia: vi.fn() } }));

const project: CaptureProject = {
  id: 'project-1',
  name: 'Project',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  sessionCount: 1,
  previewSrc: null,
};

let randomUuid: MockInstance | undefined;

beforeEach(() => {
  randomUuid = vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000001');
});

afterEach(() => randomUuid?.mockRestore());

describe('useClipComposition color layers', () => {
  it('adds an inset solid color layer with appearance defaults for three seconds and selects it', async () => {
    const currentTimeSec = ref(2);
    const activeTab = ref('canvas');
    let state!: ReturnType<typeof useClipComposition>;
    const wrapper = mount(
      defineComponent({
        setup() {
          state = useClipComposition({
            project: ref<CaptureProject | null>(project),
            editorData: ref<ProjectEditorData | null>(null),
            currentTimeSec,
            activeTab,
            editorDefaults: ref(normalizeEditorPreferenceDefaults(undefined)),
          });
          return () => h('div');
        },
      }),
    );

    await state.addElement('color');
    const color = state.selectedClip.value;

    expect(color).toMatchObject({
      kind: 'color',
      timelineStartMs: 2_000,
      timelineDurationMs: 3_000,
      sourceInMs: 0,
      sourceDurationMs: 3_000,
      transform: { x: 0.15, y: 0.2, width: 0.7, height: 0.6 },
      fill: { kind: 'color', color: '#111827' },
      opacityEnabled: false,
      opacity: 70,
      cornerRadius: 'none',
      shadowSize: 'none',
      shadowBlur: 40,
      shadowMode: 'solid',
      shadowColor: '#000000',
      shadowDirection: 'all',
      backdropBlurEnabled: false,
      backdropBlur: 35,
    });
    expect(color?.id).toBe(state.selectedClipId.value);
    expect(activeTab.value).toBe('clip');
    expect(state.composition.value.assets).toHaveLength(0);
    wrapper.unmount();
  });
});
