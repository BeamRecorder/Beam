import { ref } from 'vue';
import { useTranslate } from '../../../apps/desktop/src/i18n/useTranslate';
import type { HudProps, HudEmit } from '../../../apps/desktop/src/components/hud/hud-state-types';

// Offline state adapter only. HUD.vue owns every visible control and its layout.
export function useHudState(_props: HudProps, emit: HudEmit) {
  const { t } = useTranslate('HUD');
  const { t: tPrefs } = useTranslate('HudPreferences');
  const activeDropdowns = ref(0);
  return {
    t, tPrefs,
    captureMode: ref('instant'), modeShortcut: ref('⌘⇧I'),
    isRecording: ref(false), isBusy: ref(false), errorMessage: ref(''),
    cameraOptions: ref([{ value: 'off', label: t('cameraOff') }]), selectedCameraId: ref('off'),
    micOptions: ref([{ value: 'no-audio', label: t('noAudio') }]), selectedMicId: ref('no-audio'),
    systemAudioOptions: ref([{ value: 'off', label: t('off') }]), systemAudioMode: ref('off'),
    micLevel: ref(0), systemAudioLevel: ref(0), isTeleprompterVisible: ref(false),
    interactionAccess: { enabled: ref(true), requesting: ref(false), status: ref(null), setEnabled() {} },
    hudIssues: ref([]), isRegionSelectionLeaving: ref(false), isRegionSelectionEntering: ref(false),
    hudHeight: ref(236), captureTarget: ref('screen'), choosingSource: ref(false), activeDropdowns,
    handleDropdownToggle(open: boolean) { activeDropdowns.value = open ? 1 : 0; },
    chooseCapture() { emit('focus-feature', 'source'); },
    handleHudIssueAction() {}, authorizeInteractionAccess() {}, toggleTeleprompter() {},
    closeApp() {}, minimizeApp() {}, openPanel() {},
  };
}
