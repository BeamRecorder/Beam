import type { Ref } from 'vue';
import type { QuickSnipConfiguration, QuickSnipDeviceKind } from '~/api/types/quick-snip';

export interface QuickSnipDeviceControls {
  configuration: Ref<QuickSnipConfiguration | null>;
  microphone: Ref<boolean>;
  camera: Ref<boolean>;
  systemAudio: Ref<boolean>;
  busy: Ref<boolean>;
  disabled: () => boolean;
  generation: () => number;
  synchronize: () => Promise<void>;
}
export type QuickSnipDeviceFlags = Record<QuickSnipDeviceKind, Ref<boolean>>;
