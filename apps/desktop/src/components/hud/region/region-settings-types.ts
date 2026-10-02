import type { Ref } from 'vue';
export interface HudRegionSettingRefs {
  cameraId: Ref<string>;
  microphoneId: Ref<string>;
  systemAudioMode: Ref<'on' | 'off'>;
  countdownSeconds: Ref<number>;
  error: Ref<string>;
}
