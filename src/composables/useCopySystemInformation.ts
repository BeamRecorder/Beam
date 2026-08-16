import { onBeforeUnmount, ref } from 'vue';
import { capture } from '~/api/capture';

export const buildSystemInformation = (appVersion: string) =>
  [
    '=== Beam System Info ===',
    `App Version: ${appVersion}`,
    `Platform: ${navigator.platform || 'Unknown'}`,
    `User Agent: ${navigator.userAgent}`,
    `Language: ${navigator.language}`,
    `Screen Resolution: ${window.screen.width}x${window.screen.height} (DPR: ${window.devicePixelRatio})`,
    `Viewport: ${window.innerWidth}x${window.innerHeight}`,
    `Timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`,
    `Date: ${new Date().toISOString()}`,
    '================================',
  ].join('\n');

export function useCopySystemInformation() {
  const copied = ref(false);
  let copyTimeout: ReturnType<typeof setTimeout> | null = null;
  onBeforeUnmount(() => copyTimeout && clearTimeout(copyTimeout));

  const copy = async () => {
    let appVersion = 'Unknown';
    try {
      appVersion = (await capture.getUpdateState())?.currentVersion || appVersion;
    } catch {
      // The remaining browser diagnostics are still useful without an app version.
    }
    const information = buildSystemInformation(appVersion);
    try {
      await navigator.clipboard.writeText(information);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = information;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }
    copied.value = true;
    if (copyTimeout) clearTimeout(copyTimeout);
    copyTimeout = setTimeout(() => (copied.value = false), 2_000);
  };
  return { copied, copy };
}
