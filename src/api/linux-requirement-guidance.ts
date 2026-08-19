import type { LinuxCaptureDiagnostics, RequirementDiagnostic } from './types/capture-api';
import type { InputAccessStatus } from './types/capture-api';

const LINUX_GUIDE_URL = 'https://github.com/ExtraBinoss/Beam/blob/main/docs/dev/linux.md';

export type LinuxRequirementId = 'portal' | 'pipewire' | 'ffmpeg';

export interface LinuxRequirementGuidance {
  id: LinuxRequirementId;
  title: string;
  description: string;
  errorCode: string;
  instructions: string[];
  copyText: string;
}

export interface LinuxInteractionGuidance {
  title: string;
  description: string;
  copyText: string;
}

type PackageFamily = 'apt' | 'dnf' | 'pacman' | 'zypper';

const packageFamily = (diagnostics?: LinuxCaptureDiagnostics): PackageFamily | null => {
  const ids = [diagnostics?.distributionId, ...(diagnostics?.distributionLike || [])]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.toLowerCase());
  if (ids.some((id) => ['debian', 'ubuntu'].includes(id))) return 'apt';
  if (ids.includes('arch')) return 'pacman';
  if (ids.some((id) => id === 'suse' || id.startsWith('opensuse'))) return 'zypper';
  if (ids.some((id) => ['fedora', 'rhel'].includes(id))) return 'dnf';
  return null;
};

const packageCommand = (family: PackageFamily | null, packages: string[]): string | null => {
  if (family === 'apt') {
    return `sudo apt update && sudo apt install ${packages.join(' ')}`;
  }
  if (family === 'dnf') {
    return `sudo dnf install ${packages.map((name) => (name === 'ffmpeg' ? 'ffmpeg-free' : name)).join(' ')}`;
  }
  if (family === 'pacman') {
    return `sudo pacman -S --needed ${packages.join(' ')}`;
  }
  if (family === 'zypper') return `sudo zypper install ${packages.join(' ')}`;
  return null;
};

const portalBackendPackage = (desktop: string | null): string | null => {
  const normalized = desktop?.toLowerCase() || '';
  if (normalized.includes('gnome')) return 'xdg-desktop-portal-gnome';
  if (normalized.includes('kde') || normalized.includes('plasma')) return 'xdg-desktop-portal-kde';
  if (['sway', 'hyprland', 'wlroots'].some((name) => normalized.includes(name))) return 'xdg-desktop-portal-wlr';
  return null;
};

const report = (
  diagnostics: LinuxCaptureDiagnostics,
  id: LinuxRequirementId,
  title: string,
  requirement: RequirementDiagnostic,
  instructions: string[],
): LinuxRequirementGuidance => {
  const errorCode = requirement.errorCode || `${id}-unavailable`;
  const description = requirement.detail || `${title} is unavailable to Beam.`;
  return {
    id,
    title,
    description,
    errorCode,
    instructions,
    copyText: [
      `Beam Linux requirement: ${title}`,
      `Confirmed status: unavailable (${errorCode})`,
      `Detected system: ${diagnostics.distribution || 'Unknown Linux'}; ${diagnostics.desktop || 'Unknown desktop'}; ${diagnostics.sessionType}`,
      `Reason: ${description}`,
      '',
      'Recommended steps:',
      ...instructions.map((instruction, index) => `${index + 1}. ${instruction}`),
      `Linux guide: ${LINUX_GUIDE_URL}`,
    ].join('\n'),
  };
};

export const linuxRequirementGuidance = (diagnostics?: LinuxCaptureDiagnostics): LinuxRequirementGuidance[] => {
  if (!diagnostics || diagnostics.recordingAvailable) return [];
  const guidance: LinuxRequirementGuidance[] = [];
  const family = packageFamily(diagnostics);

  if (!diagnostics.portal.available) {
    const packages = ['xdg-desktop-portal'];
    const backend = portalBackendPackage(diagnostics.desktop);
    if (backend) packages.push(backend);
    const install = packageCommand(family, packages);
    guidance.push(
      report(diagnostics, 'portal', 'XDG ScreenCast Portal', diagnostics.portal, [
        ...(install ? [`Install or repair the detected desktop portal: ${install}`] : []),
        'Restart your desktop session after installing or updating the portal backend.',
        'Verify the user service: systemctl --user status xdg-desktop-portal',
      ]),
    );
  }

  if (!diagnostics.pipewire.available) {
    const install = packageCommand(family, ['pipewire', 'wireplumber']);
    guidance.push(
      report(diagnostics, 'pipewire', 'PipeWire', diagnostics.pipewire, [
        ...(install ? [`Install or repair PipeWire: ${install}`] : []),
        'Restart the user services: systemctl --user restart pipewire wireplumber',
        'Verify both services: systemctl --user status pipewire wireplumber',
      ]),
    );
  }

  if (!diagnostics.ffmpeg.available) {
    const install = packageCommand(family, ['ffmpeg']);
    const encoderUnavailable = diagnostics.ffmpeg.errorCode === 'ffmpeg-encoder-unavailable';
    guidance.push(
      report(diagnostics, 'ffmpeg', 'FFmpeg', diagnostics.ffmpeg, [
        ...(install ? [`Install the distribution FFmpeg package: ${install}`] : []),
        encoderUnavailable
          ? "Verify a supported encoder: ffmpeg -hide_banner -encoders | grep -E 'libx264|libopenh264'"
          : 'Verify FFmpeg and the MP4 muxer: ffmpeg -hide_banner -version && ffmpeg -hide_banner -muxers | grep -w mp4',
      ]),
    );
  }

  return guidance;
};

export const linuxInteractionGuidance = (
  diagnostics: LinuxCaptureDiagnostics | undefined,
  status: InputAccessStatus,
): LinuxInteractionGuidance | null => {
  if (status.state !== 'unavailable') return null;
  const family = packageFamily(diagnostics);
  let title = 'Interaction recording unavailable';
  let description = 'Beam could not determine why its required interaction helper is unavailable.';
  let instruction = 'Restart Beam and copy this report if the problem continues.';
  if (status.unavailableReason === 'polkit-unavailable') {
    title = 'Polkit authorization unavailable';
    description = 'Beam confirmed that pkexec is unavailable, so it cannot request protected input access.';
    const packageName = family === 'apt' ? 'pkexec' : 'polkit';
    const command = packageCommand(family, [packageName]);
    instruction = command
      ? `Install the pkexec authorization tool: ${command}`
      : 'Install Polkit and ensure pkexec is available on PATH.';
  } else if (status.unavailableReason === 'input-helper-unavailable') {
    title = 'Beam input helper is missing';
    description = 'The protected Beam input helper was not found in the installed application.';
    instruction = 'Reinstall the Beam package so the versioned input helper is installed.';
  } else if (status.unavailableReason === 'input-broker-unavailable') {
    title = 'Interaction helper unavailable';
    description = 'Beam confirmed that its protected input broker could not be initialized.';
    instruction = 'Restart Beam. If the problem continues, reinstall the Beam package.';
  }
  return {
    title,
    description,
    copyText: [
      `Beam Linux interaction issue: ${title}`,
      `Reported reason: ${status.unavailableReason || 'not-provided'}`,
      `Detected system: ${diagnostics?.distribution || 'Unknown Linux'}`,
      `Action: ${instruction}`,
      `Linux guide: ${LINUX_GUIDE_URL}`,
    ].join('\n'),
  };
};
