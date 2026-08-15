import { describe, expect, it } from 'vitest';
import { formatRecordingStartFailure } from './recording-types';

describe('formatRecordingStartFailure', () => {
  it('produces a copyable summary with startup context', () => {
    const text = formatRecordingStartFailure({
      stage: 'start-native',
      message: 'native start failed',
      nativePrepared: true,
      nativeStarted: false,
      camera: 'prepared',
      microphone: 'started',
      systemAudio: 'disabled',
    });
    expect(text).toContain('Recording failed during native startup.');
    expect(text).toContain('Stage: start-native');
    expect(text).toContain('Native prepared: yes');
    expect(text).toContain('Native started: no');
    expect(text).toContain('Camera: prepared');
    expect(text).toContain('Microphone: started');
    expect(text).toContain('System audio: disabled');
    expect(text).toContain('Error: native start failed');
  });

  it('appends cleanup errors when present', () => {
    const text = formatRecordingStartFailure({
      stage: 'start-sidecars',
      message: 'system audio failed',
      nativePrepared: false,
      nativeStarted: true,
      camera: 'started',
      microphone: 'started',
      systemAudio: 'failed',
      cleanupErrors: ['discard failed'],
    });
    expect(text).toContain('Cleanup: discard failed');
  });
});
