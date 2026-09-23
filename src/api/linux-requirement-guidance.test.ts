import { describe, expect, it } from 'vitest';
import type { LinuxCaptureDiagnostics } from './types/capture-api';
import { linuxInteractionGuidance, linuxRequirementGuidance } from './linux-requirement-guidance';

const diagnostics = (overrides: Partial<LinuxCaptureDiagnostics> = {}): LinuxCaptureDiagnostics => ({
  distribution: 'Debian GNU/Linux 13 (trixie)',
  distributionId: 'debian',
  distributionLike: [],
  distributionVersion: '13',
  kernel: '6.12.0-amd64',
  architecture: 'x86_64',
  desktop: 'GNOME',
  sessionType: 'x11',
  displayServer: 'x11',
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
  gstreamer: {
    available: true,
    encoder: 'libx264',
    codec: 'h264',
    hardware: false,
    errorCode: null,
    detail: null,
  },
  recordingAvailable: true,
  ...overrides,
});

describe('linuxRequirementGuidance', () => {
  it.each(['debian', 'ubuntu'])('uses the apt package command for %s', (distributionId) => {
    const result = linuxRequirementGuidance(
      diagnostics({
        distributionId,
        portal: {
          available: false,
          version: null,
          monitor: null,
          window: null,
          metadataCursor: null,
          errorCode: 'portal-unavailable',
          detail: 'Beam could not connect to the XDG ScreenCast portal',
        },
        recordingAvailable: false,
      }),
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.errorCode).toBe('portal-unavailable');
    expect(result[0]?.instructions).toContain(
      `Install or repair the detected desktop portal: sudo apt update && sudo apt install xdg-desktop-portal xdg-desktop-portal-gnome`,
    );
    expect(result[0]?.copyText).toContain(
      'Linux guide: https://github.com/BeamRecorder/Beam/blob/master/docs/dev/linux.md',
    );
  });

  it('does not guess a package manager for an unrecognised distribution', () => {
    const result = linuxRequirementGuidance(
      diagnostics({
        distribution: 'Gentoo Linux',
        distributionId: 'gentoo',
        desktop: 'KDE Plasma',
        portal: {
          available: false,
          version: null,
          monitor: null,
          window: null,
          metadataCursor: null,
          errorCode: 'portal-version-unsupported',
          detail: 'The XDG ScreenCast portal is older than the minimum supported version',
        },
        pipewire: {
          available: false,
          errorCode: 'pipewire-connect-failed',
          detail: 'Beam could not connect to PipeWire',
        },
        gstreamer: {
          available: false,
          encoder: null,
          codec: null,
          hardware: null,
          errorCode: 'gstreamer-unavailable',
          detail: 'GStreamer is unavailable or does not provide the required WebM muxer',
        },
        recordingAvailable: false,
      }),
    );

    expect(result).toHaveLength(3);
    expect(result.flatMap((item) => item.instructions).join('\n')).not.toMatch(/apt|dnf|pacman/);
    expect(result[0]?.instructions).toContain('Verify the user service: systemctl --user status xdg-desktop-portal');
    expect(result[1]?.instructions).toContain(
      'Restart the user services: systemctl --user restart pipewire wireplumber',
    );
    expect(result[2]?.instructions.join(' ')).toContain('bundled media runtime');
  });

  it.each([
    {
      id: 'linuxmint',
      like: ['ubuntu', 'debian'],
      command: 'sudo apt update && sudo apt install pipewire wireplumber',
    },
    { id: 'manjaro', like: ['arch'], command: 'sudo pacman -S --needed pipewire wireplumber' },
    { id: 'nobara', like: ['fedora'], command: 'sudo dnf install pipewire wireplumber' },
    { id: 'opensuse-tumbleweed', like: ['opensuse', 'suse'], command: 'sudo zypper install pipewire wireplumber' },
  ])('uses the $command package family for $id', ({ id, like, command }) => {
    const result = linuxRequirementGuidance(
      diagnostics({
        distributionId: id,
        distributionLike: like,
        pipewire: {
          available: false,
          errorCode: 'pipewire-connect-failed',
          detail: 'Beam could not connect to PipeWire',
        },
        recordingAvailable: false,
      }),
    );

    expect(result[0]?.instructions).toContain(`Install or repair PipeWire: ${command}`);
  });

  it('repairs the private runtime instead of asking for a host SDK', () => {
    const result = linuxRequirementGuidance(
      diagnostics({
        gstreamer: {
          available: false,
          encoder: null,
          codec: null,
          hardware: null,
          errorCode: 'gstreamer-encoder-unavailable',
          detail: 'GStreamer has no supported working encoder (VP8/Vorbis plugins)',
        },
        recordingAvailable: false,
      }),
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.errorCode).toBe('gstreamer-encoder-unavailable');
    expect(result[0]?.instructions.join(' ')).toContain('reinstall Beam');
    expect(result[0]?.instructions.join(' ')).not.toMatch(/sudo|apt|dnf/);
  });

  it('returns no remediation when the recording gate is healthy', () => {
    expect(linuxRequirementGuidance(diagnostics())).toEqual([]);
  });
});

describe('linuxInteractionGuidance', () => {
  it('uses the exact Debian package that provides pkexec', () => {
    const result = linuxInteractionGuidance(diagnostics(), {
      state: 'unavailable',
      canRequest: false,
      clicks: false,
      shortcuts: false,
      recordsText: false,
      unavailableReason: 'polkit-unavailable',
    });

    expect(result?.title).toBe('Polkit authorization unavailable');
    expect(result?.copyText).toContain('sudo apt update && sudo apt install pkexec');
    expect(result?.copyText).not.toContain('sudo apt install polkit');
  });

  it('does not invent a cause when an older runtime omits the reason', () => {
    const result = linuxInteractionGuidance(undefined, {
      state: 'unavailable',
      canRequest: false,
      clicks: false,
      shortcuts: false,
      recordsText: false,
    });

    expect(result?.title).toBe('Interaction recording unavailable');
    expect(result?.copyText).toContain('Reported reason: not-provided');
    expect(result?.copyText).not.toContain('Confirmed reason');
  });

  it('uses structured input errors as the cause and includes retry guidance in the copied report', () => {
    const code = 'input-broker-start-failed';
    const message = 'The protected input broker failed while opening Linux input devices.';
    const result = linuxInteractionGuidance(diagnostics(), {
      state: 'unavailable',
      canRequest: true,
      clicks: false,
      shortcuts: false,
      recordsText: false,
      error: { code, message },
    });

    expect(result?.description).toBe(message);
    expect(result?.copyText).toContain(`Error: ${code}\n${message}`);
    expect(result?.copyText).toMatch(/Action: .*retry interaction access/i);
    expect(result?.copyText).not.toContain('could not determine why');
    expect(result?.copyText).not.toContain('Reported reason: not-provided');
  });
});
