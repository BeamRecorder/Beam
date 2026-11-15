import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RecordingDiagnosticCopy from './RecordingDiagnosticCopy.vue';
import HudIssue from '../HudIssue.vue';
import RecorderBar from './RecorderBar.vue';

const { getReport } = vi.hoisted(() => ({ getReport: vi.fn() }));
vi.mock('~/api/capture', () => ({ capture: { getRecordingDiagnosticReport: getReport } }));
const writeText = vi.fn();
const wrappers: ReturnType<typeof mount>[] = [];
beforeEach(() => {
  getReport.mockReset().mockResolvedValue('{"report":"Beam recording diagnostics"}');
  writeText.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { clipboard: { writeText } });
});
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  vi.unstubAllGlobals();
});

describe('recording diagnostic copy', () => {
  it('collects only on click, copies the report and announces success', async () => {
    const wrapper = mount(RecordingDiagnosticCopy, {
      props: { message: 'Input stalled', phase: 'paused', recordingTime: '00:12' },
    });
    wrappers.push(wrapper);
    expect(getReport).not.toHaveBeenCalled();
    const button = wrapper.get('button');
    expect(button.attributes('title')).toBe('Copy recording diagnostics');
    await button.trigger('click');
    await flushPromises();
    expect(getReport).toHaveBeenCalledExactlyOnceWith({
      message: 'Input stalled',
      phase: 'paused',
      recordingTime: '00:12',
    });
    expect(writeText).toHaveBeenCalledExactlyOnceWith('{"report":"Beam recording diagnostics"}');
    expect(button.attributes('data-state')).toBe('copied');
  });

  it('shows collection errors without copying incomplete text and permits a retry', async () => {
    getReport.mockRejectedValueOnce(new Error('IPC unavailable'));
    const wrapper = mount(RecordingDiagnosticCopy, { props: { message: 'Failed to stop' } });
    wrappers.push(wrapper);
    const button = wrapper.get('button');
    await button.trigger('click');
    await flushPromises();
    expect(writeText).not.toHaveBeenCalled();
    expect(button.attributes('aria-label')).toBe('Could not copy diagnostics');
    await button.trigger('click');
    await flushPromises();
    expect(button.attributes('data-state')).toBe('copied');
  });

  it('prevents duplicate collection while waiting for diagnostics', async () => {
    let resolve!: (value: string) => void;
    getReport.mockImplementationOnce(
      () =>
        new Promise<string>((done) => {
          resolve = done;
        }),
    );
    const wrapper = mount(RecordingDiagnosticCopy, { props: { message: 'Stalled' } });
    wrappers.push(wrapper);
    const button = wrapper.get('button');
    await button.trigger('click');
    await button.trigger('click');
    expect(getReport).toHaveBeenCalledOnce();
    expect(button.attributes('aria-busy')).toBe('true');
    resolve('report');
    await flushPromises();
    expect(writeText).toHaveBeenCalledExactlyOnceWith('report');
  });

  it('makes the diagnostic action available on recording errors after returning to the HUD', async () => {
    const wrapper = mount(HudIssue, {
      props: {
        issue: {
          id: 'recording-error',
          tone: 'error',
          title: 'Recording failed',
          details: ['Engine stopped'],
          copyText: 'Native failure',
        },
      },
    });
    wrappers.push(wrapper);
    await wrapper.get('button[aria-label="Copy recording diagnostics"]').trigger('click');
    await flushPromises();
    expect(getReport).toHaveBeenCalledWith({ message: 'Native failure', phase: undefined, recordingTime: undefined });
  });

  it('copies a live warning with recording context without triggering capture controls', async () => {
    const wrapper = mount(RecorderBar, {
      props: { phase: 'recording', recordingTime: '00:23', visibility: 'always', warning: 'Input stalled' },
    });
    wrappers.push(wrapper);
    await wrapper.get('button[aria-label="Copy recording diagnostics"]').trigger('click');
    await flushPromises();
    expect(getReport).toHaveBeenCalledWith({ message: 'Input stalled', phase: 'recording', recordingTime: '00:23' });
    expect(wrapper.emitted('stop')).toBeUndefined();
    expect(wrapper.emitted('pause')).toBeUndefined();
  });
});
