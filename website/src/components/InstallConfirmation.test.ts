import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import type { GitHubRelease } from '@website/lib/platform-downloads';
import { websiteI18n } from '../i18n';

const githubState = vi.hoisted(() => ({
  release: {
    value: {
      tag_name: 'v1.2.3',
      html_url: 'https://github.com/ExtraBinoss/Beam/releases/tag/v1.2.3',
      published_at: '2026-08-16T12:00:00Z',
      assets: [
        {
          name: 'Beam-Setup-1.2.3.exe',
          browser_download_url: 'https://example.test/Beam-Setup.exe',
          size: 10 * 1024 * 1024,
          content_type: 'application/octet-stream',
        },
        {
          name: 'Beam-1.2.3-arm64.dmg',
          browser_download_url: 'https://example.test/Beam-arm64.dmg',
          size: 20 * 1024 * 1024,
          content_type: 'application/octet-stream',
        },
        {
          name: 'Beam-1.2.3-linux-x86_64.AppImage',
          browser_download_url: 'https://example.test/Beam.AppImage',
          size: 30 * 1024 * 1024,
          content_type: 'application/octet-stream',
        },
      ],
    } as GitHubRelease,
  },
  loading: { value: false },
  error: { value: null as string | null },
  load: vi.fn(async () => undefined),
}));

vi.mock('@website/composables/useGitHubRepository', () => ({
  useGitHubRepository: () => githubState,
}));

import InstallConfirmation from './InstallConfirmation.vue';

describe('InstallConfirmation', () => {
  it('shows the version with the OS icon after the title name and offers all alternatives', () => {
    const wrapper = mount(InstallConfirmation, {
      props: { platform: 'windows', autoStart: false },
      global: { plugins: [websiteI18n] },
    });

    const title = wrapper.get('#install-title');
    expect(title.text()).toContain('Download Beam v1.2.3 for Windows');
    const titleChildren = Array.from(title.element.children);
    expect(titleChildren[0]?.textContent).toContain('Download Beam v1.2.3 for Windows');
    expect(titleChildren[1]?.classList).toContain('title-platform-icon');
    expect(title.get('.title-platform-icon').classes()).toEqual(
      expect.arrayContaining(['platform-icon', 'platform-icon--windows']),
    );

    const alternatives = wrapper.findAll('.platform-card');
    expect(alternatives).toHaveLength(3);
    expect(alternatives.map((card) => card.text())).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Windows'),
        expect.stringContaining('macOS'),
        expect.stringContaining('Linux'),
      ]),
    );
    expect(wrapper.findAll('.platform-card .platform-icon')).toHaveLength(3);
    expect(wrapper.text()).toContain('View release');
    expect(wrapper.text()).toContain('Join Discord');
    expect(wrapper.text()).not.toContain('Back to Beam');
  });
});
