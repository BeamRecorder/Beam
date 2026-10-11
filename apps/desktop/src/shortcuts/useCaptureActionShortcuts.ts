import { useActionShortcuts } from './useActionShortcuts';
import type { CaptureActionShortcutOptions } from './action-types';
export function useCaptureActionShortcuts(options: CaptureActionShortcutOptions) {
  useActionShortcuts(
    () => [
      ...(['studio', 'screenshot', ...(options.instant ? ['instant' as const] : [])] as const).map((mode) => ({
        id: `capture.${mode}`,
        run: () => {
          options.mode.value = mode;
        },
      })),
      ...(['screen', 'region', 'window'] as const).map((target) => ({
        id: `capture.${target}`,
        run: () => options.choose(target),
      })),
      ...(options.settings ? [{ id: 'app.settings', run: options.settings }] : []),
      ...(options.confirm ? [{ id: 'capture.confirm', run: options.confirm }] : []),
    ],
    options.disabled,
    options.fail,
  );
}
