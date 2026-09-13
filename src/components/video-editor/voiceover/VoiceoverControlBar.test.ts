import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import VoiceoverControlBar from './VoiceoverControlBar.vue';
import type { VoiceoverPhase } from './voiceover-types';

const baseProps = {
  phase: 'idle' as const,
  elapsedLabel: '00:00',
  countdownRemaining: 0,
  waveformBars: [],
  startLabel: 'Record',
  pauseLabel: 'Pause',
  resumeLabel: 'Resume',
  stopLabel: 'Stop',
  discardLabel: 'Discard',
  preparingLabel: 'Preparing',
  canStart: true,
};

const mountBar = (phase: VoiceoverPhase) =>
  mount(VoiceoverControlBar, {
    props: { ...baseProps, phase },
    global: {
      stubs: {
        Throbber: true,
        WaveformCanvas: true,
      },
    },
  });

describe('VoiceoverControlBar', () => {
  it('keeps Stop as the primary first action while recording', () => {
    const idle = mountBar('idle');
    const record = idle.get('.voiceover-actions button');
    expect(record.text()).toContain('Record');
    expect(record.classes()).toContain('btn-primary');
    expect(record.classes()).not.toContain('btn-icon-only');
    idle.unmount();

    const recording = mountBar('recording');
    const actions = recording.findAll('.voiceover-actions button');
    expect(actions).toHaveLength(3);

    expect(actions[0]!.text()).toContain('Stop');
    expect(actions[0]!.classes()).toContain('btn-danger');
    expect(actions[0]!.classes()).not.toContain('btn-icon-only');
    expect(actions[1]!.text()).toBe('');
    expect(actions[1]!.classes()).toContain('btn-icon-only');
    expect(actions[2]!.text()).toBe('');
    expect(actions[2]!.classes()).toContain('btn-icon-only');
    recording.unmount();
  });
});
