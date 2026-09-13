import { defineComponent, ref, type Ref } from 'vue';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaAsset } from '~/media/shared/composition-types';
import { useEditorVoiceover } from './useEditorVoiceover';

const mocks = vi.hoisted(() => ({
  capture: {
    getPreferences: vi.fn(),
    updatePreferences: vi.fn(),
  },
  listBrowserMicrophones: vi.fn(),
  request: vi.fn(),
  inspectMedia: vi.fn(),
  mediaSourceDescriptor: vi.fn(),
}));

vi.mock('~/api/capture', () => ({ capture: mocks.capture }));
vi.mock('~/api/microphone-recorder', () => ({
  listBrowserMicrophones: mocks.listBrowserMicrophones,
}));
vi.mock('~/api/project-voiceover-recorder', () => ({
  ProjectVoiceoverRecorder: { request: mocks.request },
}));
vi.mock('~/media/shared', () => ({
  inspectMedia: mocks.inspectMedia,
  mediaSourceDescriptor: mocks.mediaSourceDescriptor,
}));

const microphone = {
  id: 'microphone:chromium:one',
  kind: 'microphone' as const,
  label: 'Desk mic',
  isDefault: true,
};
const asset = {
  id: 'voiceover-asset',
  kind: 'audio' as const,
  name: 'Voice-over',
  src: 'project://voiceover-asset',
  origin: 'project' as const,
} as MediaAsset;

type Recorder = {
  releasePreview: ReturnType<typeof vi.fn>;
  onFatal: ReturnType<typeof vi.fn>;
  sampleWaveform: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  resume: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  discard: ReturnType<typeof vi.fn>;
};

const createRecorder = (): Recorder => ({
  releasePreview: vi.fn(),
  onFatal: vi.fn(),
  sampleWaveform: vi.fn(() => new Float32Array([0.2, -0.1, 0.3])),
  start: vi.fn().mockResolvedValue(undefined),
  pause: vi.fn(),
  resume: vi.fn(),
  stop: vi.fn().mockResolvedValue(asset),
  discard: vi.fn().mockResolvedValue(undefined),
});

let recorder: Recorder;
let api: ReturnType<typeof useEditorVoiceover>;
let wrapper: VueWrapper;
let currentTime: Ref<number>;
let duration: Ref<number>;
let projectVolume: Ref<number>;
let setPlaying: ReturnType<typeof vi.fn>;
let seek: ReturnType<typeof vi.fn>;
let insert: ReturnType<typeof vi.fn>;
let normalize: ReturnType<typeof vi.fn>;
let onCommit: ReturnType<typeof vi.fn>;

const mountRecorder = () => {
  currentTime = ref(2.5);
  duration = ref(3);
  projectVolume = ref(75);
  setPlaying = vi.fn().mockResolvedValue(undefined);
  seek = vi.fn().mockResolvedValue(undefined);
  insert = vi.fn().mockReturnValue('voiceover-clip');
  normalize = vi.fn().mockResolvedValue(undefined);
  onCommit = vi.fn();
  const Harness = defineComponent({
    setup() {
      api = useEditorVoiceover({
        projectId: () => 'project-1',
        currentTime,
        duration,
        projectVolume,
        setPlaying: setPlaying as (playing: boolean) => Promise<void>,
        seek: seek as (seconds: number) => Promise<void>,
        insert: insert as Parameters<typeof useEditorVoiceover>[0]['insert'],
        normalize: normalize as (clipId: string) => Promise<void>,
        onCommit: onCommit as () => void,
      });
      return {};
    },
    template: '<div />',
  });
  wrapper = mount(Harness);
};

beforeEach(() => {
  vi.useFakeTimers();
  recorder = createRecorder();
  mocks.capture.getPreferences.mockResolvedValue({
    devices: { micId: microphone.id },
    voiceover: { countdownSeconds: 3, monitorProjectAudio: false },
  });
  mocks.capture.updatePreferences.mockResolvedValue(undefined);
  mocks.listBrowserMicrophones.mockResolvedValue([microphone]);
  mocks.request.mockResolvedValue(recorder);
  mocks.inspectMedia.mockResolvedValue({
    metadata: {
      durationSeconds: 1.5,
      audioTracks: [{ canDecode: true, codec: 'opus' }],
    },
    capabilities: { hasAudio: true },
  });
  mocks.mediaSourceDescriptor.mockImplementation((value: unknown) => value);
  vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
});

afterEach(() => {
  wrapper?.unmount();
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('useEditorVoiceover', () => {
  it('opens with the preferred microphone and prepares a live recorder', async () => {
    mountRecorder();

    await api.open();

    expect(api.isOpen.value).toBe(true);
    expect(api.state.phase).toBe('idle');
    expect(api.state.selectedMicrophoneId).toBe(microphone.id);
    expect(mocks.request).toHaveBeenCalledWith(microphone.id);
    expect(mocks.capture.updatePreferences).toHaveBeenCalledWith({
      devices: { micId: microphone.id },
    });
    expect(recorder.onFatal).toHaveBeenCalledOnce();
  });

  it('cancels a countdown through discard without starting the recorder', async () => {
    mountRecorder();
    await api.open();

    const startPromise = api.start();
    await flushPromises();
    expect(api.state.phase).toBe('countdown');
    expect(api.state.countdownRemaining).toBe(3);

    await api.discard();
    await startPromise;

    expect(recorder.start).not.toHaveBeenCalled();
    expect(recorder.discard).toHaveBeenCalledOnce();
    expect(api.state.draft).toBeNull();
    expect(api.state.phase).toBe('idle');
    expect(api.isOpen.value).toBe(false);
  });

  it('pauses and resumes the microphone recording', async () => {
    mountRecorder();
    await api.open();
    api.updateCountdown(0);

    await api.start();
    expect(api.state.phase).toBe('recording');
    expect(recorder.start).toHaveBeenCalledWith('project-1');

    await api.pause();
    expect(api.state.phase).toBe('paused');
    expect(recorder.pause).toHaveBeenCalledOnce();
    expect(projectVolume.value).toBe(0);

    await api.resume();
    expect(api.state.phase).toBe('recording');
    expect(recorder.resume).toHaveBeenCalledOnce();
    expect(setPlaying).toHaveBeenCalledWith(true);
  });

  it('keeps recording after the initial timeline duration has elapsed', async () => {
    const frames: FrameRequestCallback[] = [];
    vi.mocked(window.requestAnimationFrame).mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    const now = vi.spyOn(performance, 'now').mockReturnValue(0);
    mountRecorder();
    await api.open();
    api.updateCountdown(0);
    await api.start();
    expect(api.state.phase).toBe('recording');

    now.mockReturnValue(60_000);
    const frame = frames.shift();
    if (!frame) throw new Error('Expected a live waveform frame.');
    setPlaying.mockClear();
    frame(60_000);
    const nextFrame = frames.shift();
    if (!nextFrame) throw new Error('Expected the waveform loop to continue.');
    now.mockReturnValue(60_100);
    nextFrame(60_100);
    await flushPromises();

    expect(api.state.phase).toBe('recording');
    expect(recorder.stop).not.toHaveBeenCalled();
    expect(setPlaying).toHaveBeenCalledOnce();
    expect(setPlaying).toHaveBeenCalledWith(false);
    expect(api.state.draft?.durationMs).toBeGreaterThan(0);
  });

  it('stops, inserts and normalizes the completed voice-over asset', async () => {
    mountRecorder();
    await api.open();
    api.updateCountdown(0);
    await api.start();

    await api.stop();

    expect(recorder.stop).toHaveBeenCalledWith('Voice-over');
    expect(mocks.inspectMedia).toHaveBeenCalledWith(asset);
    expect(insert).toHaveBeenCalledWith(
      asset,
      expect.objectContaining({
        kind: 'audio',
        durationMs: 1_500,
        hasAudio: true,
        canDecodeAudio: true,
        audioCodec: 'opus',
      }),
      2_500,
    );
    expect(onCommit).toHaveBeenCalledOnce();
    expect(normalize).toHaveBeenCalledWith('voiceover-clip');
    expect(api.state.phase).toBe('idle');
    expect(api.state.draft).toBeNull();
    expect(api.isOpen.value).toBe(false);
  });

  it('discards an active recording and restores monitored project volume', async () => {
    mountRecorder();
    await api.open();
    api.updateCountdown(0);
    await api.start();
    expect(projectVolume.value).toBe(0);

    await api.discard();

    expect(recorder.discard).toHaveBeenCalledOnce();
    expect(projectVolume.value).toBe(75);
    expect(setPlaying).toHaveBeenLastCalledWith(false);
    expect(api.state.phase).toBe('idle');
  });
});
