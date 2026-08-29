import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import EditorTimeline from '../EditorTimeline.vue';
import type { ClipComposition } from '~/media/shared/composition-types';
import type { TimelineClipboardItem } from '../composables/timeline-clipboard-types';

const copiedItem = { descriptor: { kind: 'item', name: 'recording.mp4' } } as TimelineClipboardItem;

const TimelineTracks = {
  emits: ['update:currentTime', 'select:clip', 'hold:clip', 'clipboard:copied', 'add:element'],
  template:
    '<div class="timeline-tracks-stub"><button @click="$emit(\'update:currentTime\', 250)">Scrub</button><button @click="$emit(\'select:clip\', \'clip-1\')">Select</button><button class="hold-feedback" @click="$emit(\'hold:clip\', { id: \'clip-1\', timeMs: 500 })">Hold</button><button class="copy-feedback" @click="$emit(\'clipboard:copied\', copiedItem)">Copy</button><button class="add-feedback" @click="$emit(\'add:element\', \'blur\')">Add</button></div>',
  setup: () => ({ copiedItem }),
};

const composition: ClipComposition = {
  schemaVersion: 6,
  keyboardCaptionSessions: [],
  assets: [],
  clips: [],
};

const props = {
  currentTime: 0,
  duration: 1000,
  isPlaying: false,
  zoomElements: [],
  selectedZoomId: null,
  composition,
  selectedClipId: null,
  zoomLevel: 100,
};

describe('EditorTimeline', () => {
  it('forwards track events and toggles playback with the Space key', async () => {
    const wrapper = mount(EditorTimeline, { props, global: { stubs: { TimelineTracks } } });
    await wrapper.get('.timeline-tracks-stub button').trigger('click');
    await wrapper.findAll('.timeline-tracks-stub button')[1].trigger('click');
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
    expect(wrapper.emitted('update:currentTime')).toEqual([[250]]);
    expect(wrapper.emitted('select:clip')).toEqual([['clip-1']]);
    expect(wrapper.emitted('update:isPlaying')).toEqual([[true]]);
    wrapper.unmount();
  });

  it('ignores Space while editing a form control', () => {
    const wrapper = mount(EditorTimeline, { props, global: { stubs: { TimelineTracks } } });
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
    expect(wrapper.emitted('update:isPlaying')).toBeUndefined();
    input.remove();
    wrapper.unmount();
  });

  it('selects every timeline item with Ctrl/Cmd+A outside form controls', () => {
    const wrapper = mount(EditorTimeline, { props, global: { stubs: { TimelineTracks } } });

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true }));

    expect(wrapper.emitted('select:all')).toEqual([[]]);
    wrapper.unmount();
  });

  it('relays clipboard copy feedback from the tracks to the editor timeline', async () => {
    const wrapper = mount(EditorTimeline, { props, global: { stubs: { TimelineTracks } } });

    await wrapper.get('.copy-feedback').trigger('click');

    expect(wrapper.emitted('clipboard:copied')).toEqual([[copiedItem]]);
    wrapper.unmount();
  });

  it('forwards hold requests from the tracks to the editor timeline', async () => {
    const wrapper = mount(EditorTimeline, { props, global: { stubs: { TimelineTracks } } });

    await wrapper.get('.hold-feedback').trigger('click');

    expect(wrapper.emitted('hold:clip')).toEqual([[{ id: 'clip-1', timeMs: 500 }]]);
    wrapper.unmount();
  });

  it('forwards Add menu requests from the tracks to the editor timeline', async () => {
    const wrapper = mount(EditorTimeline, { props, global: { stubs: { TimelineTracks } } });

    await wrapper.get('.add-feedback').trigger('click');

    expect(wrapper.emitted('add:element')).toEqual([['blur']]);
    wrapper.unmount();
  });
});
