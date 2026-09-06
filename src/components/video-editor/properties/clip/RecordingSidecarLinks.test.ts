import { defineComponent, h, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import type { ClipComposition, MediaAsset, VisualClip } from '~/media/shared/composition-types';
import { COMPOSITION_SCHEMA_VERSION } from '~/media/shared/composition-types';
import { createDefaultClipAppearance } from '~/media/shared/composition-defaults';
import type { ZoomElement } from '../../zoom/zoom-types';
import RecordingSidecarLinks from './RecordingSidecarLinks.vue';

const Button = defineComponent({
  name: 'Button',
  inheritAttrs: false,
  props: {
    block: { type: Boolean, default: false },
    disabled: { type: Boolean, default: false },
  },
  emits: ['click'],
  setup(props, { attrs, emit, slots }) {
    return () =>
      h(
        'button',
        {
          'aria-label': attrs['aria-label'],
          'data-kind': props.block ? 'all' : attrs['aria-label'] ? 'one' : 'trigger',
          disabled: props.disabled,
          onClick: (event: MouseEvent) => emit('click', event),
        },
        slots.default?.(),
      );
  },
});

const Popover = defineComponent({
  name: 'Popover',
  setup(_, { slots }) {
    const open = ref(false);
    const close = () => {
      open.value = false;
    };
    return () =>
      h('div', { class: 'popover-shell' }, [
        h(
          'div',
          { class: 'popover-trigger', onClick: () => (open.value = !open.value) },
          slots.trigger?.({ isOpen: open.value }),
        ),
        open.value ? h('div', { class: 'popover-content' }, slots.default?.({ close })) : null,
      ]);
  },
});

const Divider = defineComponent({
  name: 'Divider',
  setup() {
    return () => h('div', { class: 'divider-stub' });
  },
});

const recordingAsset: MediaAsset = {
  id: 'recording-asset',
  kind: 'video',
  name: 'Recording',
  fileName: 'recording.mp4',
  durationMs: 5_000,
  width: 1_920,
  height: 1_080,
  src: '/media/recording.mp4',
  origin: 'session',
  sessionId: 'session-1',
};

const visual = (id: string, kind: VisualClip['kind'], overrides: Partial<VisualClip> = {}): VisualClip => ({
  id,
  kind,
  name: id,
  assetId: recordingAsset.id,
  timelineStartMs: 0,
  timelineDurationMs: 5_000,
  sourceInMs: 0,
  sourceDurationMs: 5_000,
  playbackRate: 1,
  transitions: { entry: null, exit: null },
  enabled: true,
  order: 0,
  trackId: `${id}-track`,
  transform: { x: 0, y: 0, width: 1, height: 1 },
  appearance: createDefaultClipAppearance(kind),
  isMirrored: false,
  isMirroredY: false,
  ...overrides,
});

const composition = (clips: VisualClip[]): ClipComposition => ({
  schemaVersion: COMPOSITION_SCHEMA_VERSION,
  assets: [recordingAsset],
  clips,
  keyboardCaptionSessions: [],
});

const autoZoom = (overrides: Partial<ZoomElement> = {}): ZoomElement => ({
  id: 'zoom-1',
  sessionId: recordingAsset.sessionId!,
  startMs: 1_000,
  endMs: 1_500,
  focus: { cx: 0.5, cy: 0.5 },
  depth: 2,
  mode: 'auto',
  linkedClipId: 'screen',
  ...overrides,
});

const fixture = (
  options: { companionLocked?: boolean; zoomLocked?: boolean; grouped?: boolean; withZoom?: boolean } = {},
) => {
  const groupId = options.grouped === false ? undefined : 'recording-group';
  return {
    composition: composition([
      visual('screen', 'screen', { groupId }),
      visual('camera', 'video', { groupId, locked: options.companionLocked }),
    ]),
    zooms: options.withZoom === false ? [] : [autoZoom({ locked: options.zoomLocked })],
  };
};

const mountLinks = (
  options: {
    companionLocked?: boolean;
    zoomLocked?: boolean;
    grouped?: boolean;
    withZoom?: boolean;
    clipId?: string;
  } = {},
) => {
  const data = fixture(options);
  return mount(RecordingSidecarLinks, {
    props: {
      clipId: options.clipId ?? 'screen',
      composition: data.composition,
      zooms: data.zooms,
    },
    global: { stubs: { Button, Popover, Divider } },
  });
};

describe('RecordingSidecarLinks', () => {
  it('unlinks an individual clip or zoom from the open popover', async () => {
    const wrapper = mountLinks();

    await wrapper.get('[data-kind="trigger"]').trigger('click');
    expect(wrapper.findAll('.sidecar-row')).toHaveLength(2);

    const individualButtons = wrapper.findAll('[data-kind="one"]');
    await individualButtons[0]!.trigger('click');
    await individualButtons[1]!.trigger('click');

    expect(wrapper.emitted('unlink')).toEqual([
      [{ clipId: 'screen', clipIds: ['camera'], zoomIds: [] }],
      [{ clipId: 'screen', clipIds: [], zoomIds: ['zoom-1'] }],
    ]);
  });

  it('unlinks every sidecar and closes the popover', async () => {
    const wrapper = mountLinks();

    await wrapper.get('[data-kind="trigger"]').trigger('click');
    await wrapper.get('[data-kind="all"]').trigger('click');

    expect(wrapper.emitted('unlink')).toEqual([[{ clipId: 'screen', clipIds: ['camera'], zoomIds: ['zoom-1'] }]]);
    expect(wrapper.find('.popover-content').exists()).toBe(false);
  });

  it('disables individual and all actions when any sidecar is locked', async () => {
    const wrapper = mountLinks({ companionLocked: true, zoomLocked: true });

    await wrapper.get('[data-kind="trigger"]').trigger('click');

    expect(wrapper.findAll('[data-kind="one"]')).toHaveLength(2);
    expect(wrapper.findAll('[data-kind="one"]').every((button) => button.attributes('disabled') !== undefined)).toBe(
      true,
    );
    expect(wrapper.get('[data-kind="all"]').attributes('disabled')).toBeDefined();
  });

  it('renders nothing when the selected clip has no recording sidecars', () => {
    const wrapper = mountLinks({ grouped: false, withZoom: false });

    expect(wrapper.find('.sidecar-links').exists()).toBe(false);
    expect(wrapper.find('[data-kind="trigger"]').exists()).toBe(false);
  });
});
