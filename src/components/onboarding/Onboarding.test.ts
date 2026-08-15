import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { MotionPlugin } from '@vueuse/motion';

const { mockCapture } = vi.hoisted(() => {
  return {
    mockCapture: {
      platform: 'linux',
      discover: vi.fn().mockResolvedValue({ displays: [], windows: [], cameras: [], microphones: [] }),
      getSources: vi.fn().mockResolvedValue([]),
      getDisplayBounds: vi.fn().mockResolvedValue(null),
      setInteractive: vi.fn(),
      setSize: vi.fn(),
      setSizeSmooth: vi.fn(),
      setPosition: vi.fn(),
      setWindowMode: vi.fn(),
      listProjects: vi.fn().mockResolvedValue([]),
      configureCameraOverlay: vi.fn(),
      setCameraOverlayActive: vi.fn(),
      onPreferencesChanged: vi.fn().mockReturnValue(() => {}),
      onPreferenceShortcut: vi.fn().mockReturnValue(() => {}),
      onScreenRegionConfigure: vi.fn().mockReturnValue(() => {}),
      onCountdown: vi.fn().mockReturnValue(() => {}),
      onTeleprompterVisibility: vi.fn().mockReturnValue(() => {}),
      onCameraOverlayState: vi.fn().mockReturnValue(() => {}),
      onCameraShadow: vi.fn().mockReturnValue(() => {}),
      getCameraOverlayState: vi.fn().mockResolvedValue(null),
      onUpdateState: vi.fn().mockReturnValue(() => {}),
      getUpdateState: vi.fn().mockResolvedValue(null),
      getPreferences: vi.fn().mockResolvedValue({
        schemaVersion: 3,
        theme: 'dark',
        recordingBar: { visibility: 'always' },
        recordingInteractions: { enabled: false, noticeDismissed: false },
        onboardingCompleted: false,
        alwaysOnTop: true,
        devices: {},
        shortcuts: {},
        backgroundPresets: { colors: [], gradients: [] },
        extras: {},
      }),
      updatePreferences: vi.fn().mockResolvedValue({
        schemaVersion: 3,
        theme: 'light',
        recordingBar: { visibility: 'always' },
        recordingInteractions: { enabled: false, noticeDismissed: false },
        onboardingCompleted: false,
        alwaysOnTop: true,
        devices: {},
        shortcuts: {},
        backgroundPresets: { colors: [], gradients: [] },
        extras: {},
      }),
      inputAccessStatus: vi.fn().mockResolvedValue({
        state: 'available',
        canRequest: false,
        clicks: true,
        shortcuts: true,
        recordsText: false,
      }),
      requestInputAccess: vi.fn().mockResolvedValue({
        state: 'available',
        canRequest: false,
        clicks: true,
        shortcuts: true,
        recordsText: false,
      }),
      getGitHubStars: vi.fn().mockResolvedValue({ stars: 350 }),
      openDiscordInvite: vi.fn().mockResolvedValue(undefined),
      openGithubRepository: vi.fn().mockResolvedValue(undefined),
      openOnboarding: vi.fn().mockResolvedValue(undefined),
      closeOnboarding: vi.fn().mockResolvedValue(undefined),
      completeOnboarding: vi.fn().mockResolvedValue(undefined),
      minimize: vi.fn(),
      close: vi.fn(),
    },
  };
});

vi.mock('~/api/capture', () => ({
  capture: mockCapture,
}));

const originalMediaDevices = navigator.mediaDevices;
const getDisplayMedia = vi.fn();
const emptyDisplayStream = () => ({
  getAudioTracks: () => [],
  getVideoTracks: () => [],
  getTracks: () => [],
});

import WelcomeStep from './WelcomeStep.vue';
import TourStep from './TourStep.vue';
import SetupStep from './SetupStep.vue';
import CommunityStep from './CommunityStep.vue';
import OnboardingApp from '../../OnboardingApp.vue';
import { i18n, setCurrentLocale } from '../../i18n';

describe('Onboarding Components', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    getDisplayMedia.mockReset();
    getDisplayMedia.mockResolvedValue(emptyDisplayStream());
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        enumerateDevices: vi.fn().mockResolvedValue([]),
        getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [] }),
        getDisplayMedia,
      },
    });
  });

  afterEach(() => {
    setCurrentLocale('en');
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: originalMediaDevices });
  });

  it('renders WelcomeStep and emits next when CTA is clicked', async () => {
    const wrapper = mount(WelcomeStep, {
      global: {
        plugins: [i18n, MotionPlugin],
      },
    });

    expect(wrapper.text()).toContain('Welcome to Beam');
    const button = wrapper.find('.cta-button');
    expect(button.exists()).toBe(true);
    await button.trigger('click');
    expect(wrapper.emitted('next')).toBeTruthy();
  });

  it('renders TourStep with real HUD and feature guide', async () => {
    const wrapper = mount(TourStep, {
      global: {
        plugins: [i18n, MotionPlugin],
      },
    });

    expect(wrapper.text()).toContain('Interactive HUD Tour');
    const chipButtons = wrapper.findAll('.chip-btn');
    expect(chipButtons.length).toBe(10);

    // Click on camera chip
    const cameraChip = chipButtons.find((c) => c.text().includes('Webcam'));
    expect(cameraChip).toBeDefined();
    await cameraChip!.trigger('click');
    expect(wrapper.text()).toContain('Webcam');
  });

  it('does not acquire system audio from the real embedded HUD when the preference is restored as on', async () => {
    mockCapture.getPreferences.mockResolvedValueOnce({
      schemaVersion: 3,
      theme: 'dark',
      recordingBar: { visibility: 'always' },
      recordingInteractions: { enabled: false, noticeDismissed: false },
      onboardingCompleted: false,
      alwaysOnTop: true,
      devices: { systemAudioMode: 'on' },
      shortcuts: {},
      backgroundPresets: { colors: [], gradients: [] },
      extras: {},
    });

    const wrapper = mount(TourStep, {
      global: {
        plugins: [i18n, MotionPlugin],
      },
    });
    await flushPromises();

    expect(wrapper.find('.hud-wrapper.embedded').exists()).toBe(true);
    expect(getDisplayMedia).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('does not initialize capture APIs when the onboarding HUD mounts embedded', async () => {
    const wrapper = mount(TourStep, {
      global: {
        plugins: [i18n, MotionPlugin],
      },
    });
    await flushPromises();

    expect(wrapper.find('.hud-wrapper.embedded').exists()).toBe(true);
    expect(mockCapture.getPreferences).not.toHaveBeenCalled();
    expect(mockCapture.discover).not.toHaveBeenCalled();
    expect(mockCapture.getSources).not.toHaveBeenCalled();
    expect(mockCapture.inputAccessStatus).not.toHaveBeenCalled();
    expect(mockCapture.configureCameraOverlay).not.toHaveBeenCalled();
    expect(mockCapture.updatePreferences).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('localizes the live-HUD instruction and renders it only once', async () => {
    setCurrentLocale('fr');
    const wrapper = mount(TourStep, {
      global: {
        plugins: [i18n, MotionPlugin],
      },
    });
    const instruction = i18n.global.t('Onboarding.tourSubtitle');
    const countInstruction = () => wrapper.text().split(instruction).length - 1;

    expect(wrapper.find('.tour-subtitle').text()).toBe(instruction);
    expect(countInstruction()).toBe(1);
    expect(wrapper.text()).not.toContain('Click any control on the live HUD');

    const cameraChip = wrapper.findAll('.chip-btn').find((chip) => chip.text().includes('Webcam'));
    expect(cameraChip).toBeDefined();
    await cameraChip!.trigger('click');
    await wrapper.vm.$nextTick();
    expect(countInstruction()).toBe(1);
    expect(wrapper.find('.feature-detail-card').exists()).toBe(true);
  });

  it('renders SetupStep and interacts with theme', async () => {
    const wrapper = mount(SetupStep, {
      global: {
        plugins: [i18n, MotionPlugin],
      },
    });

    await new Promise((r) => setTimeout(r, 20));
    expect(wrapper.text()).toContain('Appearance');
    const themeButtons = wrapper.findAll('.theme-chip');
    expect(themeButtons.length).toBe(3);

    // Switch to light theme (index 1)
    await themeButtons[1].trigger('click');
    await wrapper.vm.$nextTick();
    expect(themeButtons[1].classes()).toContain('selected');
  });

  it('renders CommunityStep and emits complete', async () => {
    const wrapper = mount(CommunityStep, {
      global: {
        plugins: [i18n, MotionPlugin],
      },
    });

    expect(wrapper.text()).toContain('Discord');
    const launchBtn = wrapper.find('.launch-button');
    expect(launchBtn.exists()).toBe(true);
    await launchBtn.trigger('click');
    expect(wrapper.emitted('complete')).toBeTruthy();
  });

  it('navigates through steps in OnboardingApp', async () => {
    const wrapper = mount(OnboardingApp, {
      global: {
        plugins: [i18n, MotionPlugin],
      },
    });

    expect(wrapper.findComponent(WelcomeStep).exists()).toBe(true);
    const dismissBtn = wrapper.find('.dismiss-btn');
    await dismissBtn.trigger('click');
    expect(mockCapture.closeOnboarding).toHaveBeenCalled();
  });
});
