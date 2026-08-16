import { readonly, ref } from 'vue';
import type { GitHubRelease } from '@website/lib/platform-downloads';
import { websiteI18n } from '@website/i18n';

const REPOSITORY_API = 'https://api.github.com/repos/ExtraBinoss/Beam';
const t = websiteI18n.global.t;

const stars = ref<number | null>(null);
const contributorCount = ref<number | null>(null);
const release = ref<GitHubRelease | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
let request: Promise<void> | null = null;

const githubRequest = async <T>(path = ''): Promise<T> => {
  const response = await fetch(`${REPOSITORY_API}${path}`, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!response.ok) throw new Error(t('Website.errors.githubStatus', { status: response.status }));
  return response.json() as Promise<T>;
};

export const loadGitHubRepository = () => {
  if (request) return request;
  loading.value = true;
  error.value = null;
  request = Promise.all([
    githubRequest<{ stargazers_count: number }>(),
    githubRequest<GitHubRelease>('/releases/latest'),
    githubRequest<unknown[]>('/contributors?per_page=100&anon=1'),
  ])
    .then(([repository, latestRelease, contributors]) => {
      stars.value = repository.stargazers_count;
      release.value = latestRelease;
      contributorCount.value = contributors.length;
    })
    .catch((reason: unknown) => {
      error.value = reason instanceof Error ? reason.message : t('Website.errors.githubUnavailable');
      request = null;
    })
    .finally(() => {
      loading.value = false;
    });
  return request;
};

export function useGitHubRepository() {
  return {
    stars: readonly(stars),
    contributorCount: readonly(contributorCount),
    release: readonly(release),
    loading: readonly(loading),
    error: readonly(error),
    load: loadGitHubRepository,
  };
}
