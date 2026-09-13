import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const jsonResponse = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });

describe('useGitHubRepository', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  const repositoryUrl = 'https://api.github.com/repos/BeamRecorder/Beam';
  const releaseUrl = `${repositoryUrl}/releases/latest`;

  beforeEach(() => {
    vi.resetModules();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('loads the repository stars and latest release without requesting contributors', async () => {
    const repository = { stargazers_count: 128 };
    const release = {
      tag_name: 'v1.2.3',
      html_url: 'https://github.com/BeamRecorder/Beam/releases/tag/v1.2.3',
      published_at: '2026-08-16T12:00:00Z',
      assets: [
        {
          name: 'Beam-1.2.3-linux-x86_64.AppImage',
          browser_download_url: 'https://example.test/Beam.AppImage',
          size: 42,
          content_type: 'application/octet-stream',
        },
      ],
    };
    fetchMock.mockImplementation(async (input: RequestInfo | URL) =>
      String(input) === releaseUrl ? jsonResponse(release) : jsonResponse(repository),
    );

    const { useGitHubRepository } = await import('./useGitHubRepository');
    const state = useGitHubRepository();

    await state.load();

    expect(state.stars.value).toBe(repository.stargazers_count);
    expect(state.release.value).toEqual(release);
    expect(state.loading.value).toBe(false);
    expect(state.error.value).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual([repositoryUrl, releaseUrl]);
  });

  it('keeps successful data when one GitHub request fails', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === releaseUrl) return jsonResponse({}, 503);
      return jsonResponse({ stargazers_count: 10 });
    });

    const { useGitHubRepository } = await import('./useGitHubRepository');
    const state = useGitHubRepository();

    await state.load();

    expect(state.stars.value).toBe(10);
    expect(state.release.value).toBeNull();
    expect(state.loading.value).toBe(false);
    expect(state.error.value).toBe('GitHub API returned 503.');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('allows a failed load to be retried successfully', async () => {
    const repository = { stargazers_count: 256 };
    const release = {
      tag_name: 'v2.0.0',
      html_url: 'https://github.com/BeamRecorder/Beam/releases/tag/v2.0.0',
      published_at: '2026-08-16T13:00:00Z',
      assets: [],
    };
    let failRelease = true;
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === releaseUrl) {
        if (failRelease) {
          failRelease = false;
          return jsonResponse({}, 500);
        }
        return jsonResponse(release);
      }
      return jsonResponse(repository);
    });

    const { useGitHubRepository } = await import('./useGitHubRepository');
    const state = useGitHubRepository();

    await state.load();
    expect(state.error.value).toBe('GitHub API returned 500.');

    await state.load();

    expect(state.stars.value).toBe(repository.stargazers_count);
    expect(state.release.value).toEqual(release);
    expect(state.error.value).toBeNull();
    expect(state.loading.value).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual([repositoryUrl, releaseUrl, releaseUrl]);
  });
});
