import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import EditorTimeline from '../EditorTimeline.vue';
import type { ClipComposition } from '~/media/shared/composition-types';

const TimelineTracks = {
  emits: ['update:currentTime', 'select:clip'],
  template:
    '<div class="timeline-tracks-stub"><button @click="$emit(\'update:currentTime\', 250)">Scrub</button><button @click="$emit(\'select:clip\', \'clip-1\')">Select</button></div>',
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
});
