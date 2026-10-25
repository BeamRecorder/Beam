import type { Ref } from 'vue';

export interface ScreenCursorVisibilityContext {
  enabled: Ref<boolean>;
  mixed: Ref<boolean>;
  disabled: Ref<boolean>;
  hasTargets: Ref<boolean>;
}
