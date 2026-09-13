import { computed, defineComponent, h, nextTick, ref, type Ref } from 'vue';
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  CaptureCatalog,
  InputAccessStatus,
  LinuxCaptureDiagnostics,
  PreferenceSettings,
} from '~/api/types/capture-api';
import type { InteractionAccessViewState } from './interactions/interaction-access-types';
import type { useInteractionAccess } from './interactions/useInteractionAccess';
import { useHudIssues } from './useHudIssues';

const capture = vi.hoisted(() => ({ platform: 'linux' }));
vi.mock('~/api/capture', () => ({ capture }));
vi.mock('~/i18n/useTranslate', () => ({ useTranslate: () => ({ t: (key: string) => key }) }));

const accessFailure: InputAccessStatus = {
  state: 'unavailable',
  canRequest: true,
  clicks: false,
  shortcuts: false,
  recordsText: false,
  error: {
    code: 'input-broker-start-failed',
    message: 'The protected input broker failed to start.',
  },
};

const available: InputAccessStatus = {
  state: 'available',
  canRequest: false,
  clicks: true,
  shortcuts: true,
  recordsText: false,
};

const linuxDiagnostics: LinuxCaptureDiagnostics = {
  distribution: 'Debian GNU/Linux 13 (trixie)',
  distributionId: 'debian',
  distributionLike: [],
  distributionVersion: '13',
  kernel: '6.12.0-amd64',
  architecture: 'x86_64',
  desktop: 'GNOME',
  sessionType: 'x11',
  displayServer: 'X11',
  backend: 'xdg-portal-pipewire',
  portal: {
    available: true,
    version: 5,
    monitor: true,
    window: true,
    metadataCursor: true,
    errorCode: null,
    detail: null,
  },
  pipewire: { available: true, errorCode: null, detail: null },
  ffmpeg: {
    available: true,
    encoder: 'libx264',
    codec: 'h264',
    hardware: false,
    errorCode: null,
    detail: null,
  },
  recordingAvailable: true,
};

const createInteractionAccess = (
  initialStatus: InteractionAccessViewState,
  onRequest: (status: Ref<InteractionAccessViewState>) => Promise<void> = async () => {},
) => {
  const status = ref<InteractionAccessViewState>(initialStatus);
  const enabled = ref(false);
  const noticeDismissed = ref(false);
  const requesting = ref(false);
  const access: ReturnType<typeof useInteractionAccess> = {
    status,
    enabled,
    noticeDismissed,
    requesting,
    recordingEnabled: computed(() => enabled.value && status.value.state === 'available'),
    hydrate: (_nextPreferences: PreferenceSettings) => {},
    refresh: async () => {},
    request: async () => {
      requesting.value = true;
      try {
        await onRequest(status);
      } finally {
        requesting.value = false;
      }
    },
    setEnabled: async (value: boolean) => {
      enabled.value = status.value.state === 'available' && value;
    },
  };
  return { access, status };
};

const mountHudIssues = (
  interactionStatus: InteractionAccessViewState,
  onRequest?: (status: Ref<InteractionAccessViewState>) => Promise<void>,
  diagnostics?: LinuxCaptureDiagnostics,
) => {
  let state!: ReturnType<typeof useHudIssues>;
  const interaction = createInteractionAccess(interactionStatus, onRequest);
  const catalog = ref<CaptureCatalog | null>(
    diagnostics ? { sources: [], capabilities: {}, diagnostics: { platform: 'linux', linux: diagnostics } } : null,
  );
  const shownError = ref('');
  const wrapper = mount(
    defineComponent({
      setup() {
        state = useHudIssues(catalog, shownError, interaction.access);
        return () => h('div');
      },
    }),
  );
  return { state, wrapper, interaction };
};

describe('useHudIssues input access', () => {
  beforeEach(() => {
    capture.platform = 'linux';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows structured retryable failures as errors with the authorize action', () => {
    const { state, wrapper } = mountHudIssues(accessFailure);

    expect(state.hudIssues.value).toEqual([
      expect.objectContaining({
        id: 'interaction-access',
        tone: 'error',
        details: [accessFailure.error?.message],
        actionLabel: 'authorizeInteractions',
        actionLoading: false,
        actionDisabled: false,
      }),
    ]);
    wrapper.unmount();
  });

  it('clears the failed issue after authorization and shows the existing success feedback', async () => {
    const { state, wrapper, interaction } = mountHudIssues(accessFailure, async (status) => {
      status.value = available;
    });

    await state.handleHudIssueAction('interaction-access');
    await nextTick();

    expect(interaction.access.requesting.value).toBe(false);
    expect(state.hudIssues.value).toEqual([
      expect.objectContaining({
        id: 'interaction-success',
        tone: 'success',
        title: 'interactionAccessGranted',
        details: ['interactionAccessGrantedDescription'],
      }),
    ]);
    wrapper.unmount();
  });

  it('keeps missing Polkit as a nonretryable guided issue', () => {
    const missingPolkit: InputAccessStatus = {
      state: 'unavailable',
      canRequest: false,
      clicks: false,
      shortcuts: false,
      recordsText: false,
      unavailableReason: 'polkit-unavailable',
    };
    const { state, wrapper } = mountHudIssues(missingPolkit, undefined, linuxDiagnostics);

    expect(state.hudIssues.value).toHaveLength(1);
    expect(state.hudIssues.value[0]).toMatchObject({
      id: 'interaction-unavailable',
      title: 'Polkit authorization unavailable',
      tone: 'info',
      details: ['Beam confirmed that pkexec is unavailable, so it cannot request protected input access.'],
      copyText: expect.stringContaining('sudo apt update && sudo apt install pkexec'),
    });
    expect(state.hudIssues.value[0]?.actionLabel).toBeUndefined();
    wrapper.unmount();
  });
});
