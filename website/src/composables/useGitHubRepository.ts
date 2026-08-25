import { computed, readonly, ref } from 'vue';
import type { GitHubRelease } from '@website/lib/platform-downloads';
import { websiteI18n } from '@website/i18n';

const REPOSITORY_API = 'https://api.github.com/repos/BeamRecorder/Beam';
const REQUEST_TIMEOUT_MS = 8_000;
const t = websiteI18n.global.t;

const stars = ref<number | null>(null);
const release = ref<GitHubRelease | null>(null);
const starsLoading = ref(false);
const releaseLoading = ref(false);
const starsError = ref<string | null>(null);
const releaseError = ref<string | null>(null);
let starsRequest: Promise<void> | null = null;
let releaseRequest: Promise<void> | null = null;

const githubRequest = async <T>(path = ''): Promise<T> => {
  const response = await fetch(`${REPOSITORY_API}${path}`, {
    headers: { Accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(t('Website.errors.githubStatus', { status: response.status }));
  return response.json() as Promise<T>;
};

const errorMessage = (reason: unknown) =>
  reason instanceof Error ? reason.message : t('Website.errors.githubUnavailable');

export const loadGitHubStars = () => {
  if (starsRequest) return starsRequest;
  starsLoading.value = true;
  starsError.value = null;
  starsRequest = githubRequest<{ stargazers_count: number }>()
    .then((repository) => {
      if (!Number.isFinite(repository.stargazers_count)) throw new Error(t('Website.errors.githubUnavailable'));
      stars.value = repository.stargazers_count;
    })
    .catch((reason: unknown) => {
      starsError.value = errorMessage(reason);
      starsRequest = null;
    })
    .finally(() => {
      starsLoading.value = false;
    });
  return starsRequest;
};

export const loadGitHubRelease = () => {
  if (releaseRequest) return releaseRequest;
  releaseLoading.value = true;
  releaseError.value = null;
  releaseRequest = githubRequest<GitHubRelease>('/releases/latest')
    .then((latestRelease) => {
      if (!latestRelease.tag_name || !Array.isArray(latestRelease.assets)) {
        throw new Error(t('Website.errors.githubUnavailable'));
      }
      release.value = latestRelease;
    })
    .catch((reason: unknown) => {
      releaseError.value = errorMessage(reason);
      releaseRequest = null;
    })
    .finally(() => {
      releaseLoading.value = false;
    });
  return releaseRequest;
};

export const loadGitHubRepository = () => Promise.all([loadGitHubStars(), loadGitHubRelease()]).then(() => undefined);

export function useGitHubRepository() {
  return {
    stars: readonly(stars),
    release: readonly(release),
    starsLoading: readonly(starsLoading),
    releaseLoading: readonly(releaseLoading),
    loading: readonly(computed(() => starsLoading.value || releaseLoading.value)),
    starsError: readonly(starsError),
    error: readonly(releaseError),
    loadStars: loadGitHubStars,
    loadRelease: loadGitHubRelease,
    load: loadGitHubRepository,
  };
}
