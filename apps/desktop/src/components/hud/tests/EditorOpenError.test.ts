import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import EditorOpenError from '../EditorOpenError.vue';
import CopyButton from '~/ui/button/CopyButton.vue';
const props = {
  error: 'failed',
  progress: { stage: 'loadingTimeline' as const, value: 60 },
  appVersion: '0.4.0',
  runtimePlatform: 'linux',
  occurredAt: 'now',
  projectId: 'project',
  projectMode: 'studio' as const,
};
describe('editor opening errors', () => {
  it.each([
    ['BEAM_EDITOR_UNRESPONSIVE', 'stopped responding'],
    ['BEAM_EDITOR_TIMEOUT', 'within 30 seconds'],
    ['BEAM_EDITOR_LOAD_FAILED', 'interface could not load'],
    ['BEAM_EDITOR_RENDERER_GONE', 'stopped unexpectedly'],
  ])('shows a downcast mascot and an actionable reason for %s', async (errorCode, text) => {
    const wrapper = mount(EditorOpenError, {
      props: { ...props, errorCode },
    });
    expect(wrapper.get('[data-phase]').attributes('data-phase')).toBe('failed');
    expect(wrapper.get('.editor-open-error-reason').text()).toContain(text);
    expect(wrapper.getComponent(CopyButton).props('text')).toContain(`Failure code: ${errorCode}`);
    expect(wrapper.get('.copy-button-idle').attributes('title')).toBeUndefined();
    await wrapper.findAll('button').at(-1)!.trigger('click');
    expect(wrapper.emitted('dismiss')).toEqual([[]]);
    wrapper.unmount();
  });
  it('extracts a native code from the error while keeping technical details in the copy action', () => {
    const wrapper = mount(EditorOpenError, {
      props: { ...props, error: 'BEAM_EDITOR_TIMEOUT: deadline exceeded' },
    });
    expect(wrapper.getComponent(CopyButton).props('text')).toContain('Classification: timeout');
    expect(wrapper.get('.editor-open-error-reason').text()).not.toContain('BEAM_EDITOR_');
    wrapper.unmount();
  });
  it('reports missing diagnostic metadata without hiding the unknown failure', () => {
    const agent = vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('');
    const wrapper = mount(EditorOpenError, {
      props: {
        ...props,
        appVersion: '',
        runtimePlatform: '',
        occurredAt: '',
        projectId: undefined,
        projectMode: undefined,
      },
    });
    const report = wrapper.getComponent(CopyButton).props('text');
    expect(report).toContain('Failure code: BEAM_EDITOR_UNKNOWN');
    expect(report).toContain('App version: Unknown');
    expect(report).toContain('Project ID: Unknown');
    expect(report).toContain('Project mode: Unknown');
    expect(report).toContain('Occurred at: Unknown');
    expect(report).toContain('User agent: Unknown');
    wrapper.unmount();
    agent.mockRestore();
  });
});
