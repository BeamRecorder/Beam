import { onBeforeUnmount, ref } from 'vue';
import { capture } from '~/api/capture';
import { latestCaptureCatalog, rememberCaptureCatalog, unavailableLinuxRequirements } from '~/api/capture-diagnostics';
import { linuxInteractionGuidance, linuxRequirementGuidance } from '~/api/linux-requirement-guidance';
import type { CaptureCatalog, InputAccessStatus, LinuxCaptureDiagnostics } from '~/api/types/capture-api';

const yesNo = (value: boolean | null | undefined) => (value == null ? 'Unknown' : value ? 'Yes' : 'No');

const linuxSystemInformation = (diagnostics: LinuxCaptureDiagnostics, inputAccess?: InputAccessStatus): string[] => {
  const portalFeatures = [
    diagnostics.portal.version == null ? null : `v${diagnostics.portal.version}`,
    diagnostics.portal.monitor ? 'monitor' : null,
    diagnostics.portal.window ? 'window' : null,
    diagnostics.portal.metadataCursor ? 'cursor metadata' : null,
  ].filter(Boolean);
  const encoder = [
    diagnostics.ffmpeg.encoder,
    diagnostics.ffmpeg.codec,
    diagnostics.ffmpeg.hardware == null ? null : diagnostics.ffmpeg.hardware ? 'hardware' : 'software',
  ].filter(Boolean);
  const issues = unavailableLinuxRequirements(diagnostics);
  const guidance = linuxRequirementGuidance(diagnostics);
  const interactionGuidance = inputAccess ? linuxInteractionGuidance(diagnostics, inputAccess) : null;
  return [
    '',
    '--- Linux Runtime ---',
    `Distribution: ${diagnostics.distribution || 'Unknown'}`,
    `Distribution ID: ${diagnostics.distributionId || 'Unknown'}`,
    `Distribution Version: ${diagnostics.distributionVersion || 'Unknown'}`,
    `Distribution Like: ${diagnostics.distributionLike?.length ? diagnostics.distributionLike.join(', ') : 'None reported'}`,
    `Kernel: ${diagnostics.kernel || 'Unknown'}`,
    `Architecture: ${diagnostics.architecture || 'Unknown'}`,
    `Desktop: ${diagnostics.desktop || 'Unknown'}`,
    `Session Type: ${diagnostics.sessionType || 'Unknown'}`,
    `Display Server: ${diagnostics.displayServer || 'Unknown'}`,
    `Capture Backend: ${diagnostics.backend || 'Unknown'}`,
    `XDG ScreenCast Portal: ${yesNo(diagnostics.portal.available)}${portalFeatures.length ? ` (${portalFeatures.join(', ')})` : ''}`,
    `PipeWire: ${yesNo(diagnostics.pipewire.available)}`,
    `FFmpeg: ${yesNo(diagnostics.ffmpeg.available)}${encoder.length ? ` (${encoder.join(', ')})` : ''}`,
    `Recording Available: ${yesNo(diagnostics.recordingAvailable)}`,
    `Interaction Access: ${inputAccess?.state || 'Unknown'}${inputAccess?.unavailableReason ? ` (${inputAccess.unavailableReason})` : inputAccess ? ` (clicks=${yesNo(inputAccess.clicks)}, shortcuts=${yesNo(inputAccess.shortcuts)})` : ''}`,
    ...(issues.length > 0 ? ['Linux Requirement Issues:', ...issues.map((issue) => `- ${issue}`)] : []),
    ...(guidance.length > 0
      ? ['', 'Linux Requirement Fixes:', ...guidance.flatMap((item) => ['', item.copyText])]
      : []),
    ...(interactionGuidance ? ['', 'Linux Interaction Fix:', interactionGuidance.copyText] : []),
  ];
};

export const buildSystemInformation = (
  appVersion: string,
  catalog?: CaptureCatalog | null,
  inputAccess?: InputAccessStatus,
) =>
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
    ...(catalog?.diagnostics?.linux ? linuxSystemInformation(catalog.diagnostics.linux, inputAccess) : []),
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
    let catalog = latestCaptureCatalog();
    let inputAccess: InputAccessStatus | undefined;
    if (capture.platform === 'linux') {
      if (!catalog) {
        try {
          catalog = await capture.discover();
          rememberCaptureCatalog(catalog);
        } catch {
          // Browser diagnostics remain useful when the native engine is unavailable.
        }
      }
      try {
        inputAccess = await capture.inputAccessStatus();
      } catch {
        // Interaction capture is optional and must not prevent copying diagnostics.
      }
    }
    const information = buildSystemInformation(appVersion, catalog, inputAccess);
    let succeeded = false;
    try {
      await navigator.clipboard.writeText(information);
      succeeded = true;
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = information;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      try {
        textarea.select();
        succeeded = document.execCommand('copy');
      } finally {
        textarea.remove();
      }
    }
    if (!succeeded) return;
    copied.value = true;
    if (copyTimeout) clearTimeout(copyTimeout);
    copyTimeout = setTimeout(() => (copied.value = false), 2_000);
  };
  return { copied, copy };
}
