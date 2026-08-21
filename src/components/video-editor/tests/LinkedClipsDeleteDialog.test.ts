import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { i18n } from '~/i18n';
import type { AudioClip, Clip, VisualClip } from '~/media/shared/composition-types';
import { createDefaultClipAppearance } from '~/media/shared/composition-defaults';
import LinkedClipsDeleteDialog from '../LinkedClipsDeleteDialog.vue';

const Dialog = {
  props: { isOpen: Boolean, title: { type: String, default: '' } },
  emits: ['close'],
  template: `
    <div v-if="isOpen" class="dialog-stub" role="dialog" aria-modal="true">
      <h2>{{ title }}</h2>
      <slot />
      <button class="dialog-close" type="button" @click="$emit('close')">Close</button>
    </div>
  `,
};

const Button = {
  inheritAttrs: true,
  props: {
    block: Boolean,
    icon: { type: null, default: null },
    size: String,
    tooltip: String,
    tooltipVariant: String,
    variant: String,
  },
  emits: ['click'],
  template: '<button v-bind="$attrs" type="button" @click="$emit(\'click\')"><slot /></button>',
};

const linkedVideo: VisualClip = {
  id: 'video-clip',
  kind: 'video',
  name: 'Interview.mp4',
  assetId: 'video-asset',
  timelineStartMs: 0,
  timelineDurationMs: 4_000,
  sourceInMs: 0,
  sourceDurationMs: 4_000,
  playbackRate: 1,
  enabled: true,
  order: 0,
  groupId: 'imported-group',
  transform: { x: 0, y: 0, width: 1, height: 1 },
  appearance: createDefaultClipAppearance('video'),
  isMirrored: false,
  isMirroredY: false,
};

const linkedAudio: AudioClip = {
  id: 'audio-clip',
  kind: 'audio',
  name: 'Interview audio',
  assetId: 'audio-asset',
  role: 'imported',
  timelineStartMs: 0,
  timelineDurationMs: 4_000,
  sourceInMs: 0,
  sourceDurationMs: 4_000,
  playbackRate: 1,
  enabled: true,
  order: 1,
  groupId: 'imported-group',
  volume: 100,
};

const stubs = { Dialog, Button };

const mountDialog = (clips: readonly Clip[] = [linkedVideo, linkedAudio]) =>
  mount(LinkedClipsDeleteDialog, {
    props: { isOpen: true, clips: [...clips] },
    global: { plugins: [i18n], stubs },
  });

describe('LinkedClipsDeleteDialog', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('lists every linked clip and deletes one item without closing the dialog', async () => {
    const wrapper = mountDialog();

    expect(wrapper.find('[role="dialog"]').exists()).toBe(true);
    expect(wrapper.findAll('.linked-clip-row')).toHaveLength(2);
    expect(wrapper.findAll('.clip-name').map((node) => node.text())).toEqual([linkedVideo.name, linkedAudio.name]);

    await wrapper.get('.delete-one-button').trigger('click');

    expect(wrapper.emitted('delete')).toEqual([[[linkedVideo.id]]]);
    expect(wrapper.emitted('close')).toBeUndefined();
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true);

    // The parent removes the item after handling the event; the dialog itself
    // remains mounted so another linked clip can be deleted or the user can
    // close it explicitly.
    await wrapper.setProps({ clips: [linkedAudio] });
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true);
    expect(wrapper.findAll('.linked-clip-row')).toHaveLength(1);
  });

  it('emits all linked ids from the delete-all action', async () => {
    const wrapper = mountDialog();

    await wrapper.get('.delete-all-button').trigger('click');

    expect(wrapper.emitted('delete')).toEqual([[[linkedVideo.id, linkedAudio.id]]]);
    expect(wrapper.emitted('close')).toBeUndefined();
  });

  it('forwards an explicit close without deleting anything', async () => {
    const wrapper = mountDialog();

    await wrapper.get('.dialog-close').trigger('click');

    expect(wrapper.emitted('close')).toEqual([[]]);
    expect(wrapper.emitted('delete')).toBeUndefined();
  });

  it('shows completion immediately and closes after the 900ms completion animation', async () => {
    vi.useFakeTimers();
    const wrapper = mountDialog();

    await wrapper.setProps({ clips: [] });

    expect(wrapper.find('.linked-clip-list').exists()).toBe(false);
    expect(wrapper.find('[role="status"]').exists()).toBe(true);
    expect(wrapper.find('.completion-check').exists()).toBe(true);
    expect(wrapper.find('.delete-all-button').exists()).toBe(false);
    expect(wrapper.find('.delete-one-button').exists()).toBe(false);
    expect(wrapper.emitted('close')).toBeUndefined();

    await vi.advanceTimersByTimeAsync(899);
    expect(wrapper.emitted('close')).toBeUndefined();

    await vi.advanceTimersByTimeAsync(1);
    expect(wrapper.emitted('close')).toEqual([[]]);
  });
});
