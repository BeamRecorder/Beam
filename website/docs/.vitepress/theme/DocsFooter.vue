<script setup lang="ts">
import { computed } from 'vue';
import { ExternalLink } from '@lucide/vue';
import { useData, withBase } from 'vitepress';
import discordIconUrl from '../../../../public/discord_svg.svg';
import githubIconUrl from '../../../../public/github.svg';
import type { DocsSidebarItem } from '../content/docs-content-types';
import { enabledDocsLocales, getDocsCatalogs, type DocsLocale } from '../content/docs-routes';

const githubUrl = 'https://github.com/BeamRecorder/Beam';
const discordUrl = 'https://discord.gg/6Q6v2xUCB';
const websiteUrl = 'https://beam.plinka.eu';
const installUrl = `${websiteUrl}/install`;
const importantPaths = ['/getting-started', '/recorder/', '/editor/', '/export', '/platforms'] as const;

const { page } = useData();

const locale = computed<DocsLocale>(() => {
  const prefix = page.value.relativePath.split('/')[0];
  return enabledDocsLocales.includes(prefix as DocsLocale) ? (prefix as DocsLocale) : 'en';
});

const common = computed(() => getDocsCatalogs(locale.value).common);

const flattenSidebar = (items: readonly DocsSidebarItem[]): DocsSidebarItem[] =>
  items.flatMap((item) => [item, ...(item.items ? flattenSidebar(item.items) : [])]);

const importantLinks = computed(() => {
  const items = common.value.sidebar.flatMap((group) => flattenSidebar(group.items));
  const prefix = locale.value === 'en' ? '' : `${locale.value}/`;
  return importantPaths.flatMap((path) => {
    const item = items.find((candidate) => candidate.link === path);
    if (!item) return [];
    return [{ label: item.text, href: withBase(`/${prefix}${path.replace(/^\//, '')}`) }];
  });
});
</script>

<template>
  <footer class="docs-footer">
    <div class="docs-footer__inner">
      <section class="docs-footer__brand">
        <a class="docs-footer__wordmark" :href="websiteUrl">
          <img :src="withBase('/favicon.webp')" alt="" width="34" height="34" />
          <span>Beam <small>Docs</small></span>
        </a>
        <p>{{ common.footer.message }}</p>
      </section>

      <nav class="docs-footer__links" aria-label="Documentation links">
        <section>
          <h2>Product</h2>
          <a :href="websiteUrl">{{ common.nav.website }} <ExternalLink aria-hidden="true" /></a>
          <a :href="installUrl">Install Beam <ExternalLink aria-hidden="true" /></a>
        </section>

        <section>
          <h2>Community</h2>
          <a :href="githubUrl" target="_blank" rel="noreferrer"> <img :src="githubIconUrl" alt="" /> GitHub </a>
          <a :href="discordUrl" target="_blank" rel="noreferrer"> <img :src="discordIconUrl" alt="" /> Discord </a>
        </section>

        <section>
          <h2>Documentation</h2>
          <a v-for="link in importantLinks" :key="link.href" :href="link.href">{{ link.label }}</a>
        </section>
      </nav>
    </div>

    <div class="docs-footer__bottom">
      <span>{{ common.footer.copyright }}</span>
      <a href="https://github.com/BeamRecorder/Beam/blob/master/LICENSE" target="_blank" rel="noreferrer">
        MIT License
      </a>
    </div>
  </footer>
</template>

<style scoped>
.docs-footer {
  position: relative;
  z-index: 1;
  border-top: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-bg-surface) 78%, transparent);
}

.docs-footer__inner,
.docs-footer__bottom {
  width: min(100% - 48px, 1240px);
  margin: 0 auto;
}

.docs-footer__inner {
  display: grid;
  padding: 52px 0 44px;
  grid-template-columns: minmax(220px, 1.2fr) minmax(0, 2fr);
  gap: clamp(40px, 8vw, 112px);
}

.docs-footer__brand {
  align-self: start;
}

.docs-footer__wordmark {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: var(--text-primary);
  font-family: var(--font-headline);
  font-size: 18px;
  font-weight: 760;
  letter-spacing: -0.02em;
  text-decoration: none;
}

.docs-footer__wordmark img {
  border-radius: 9px;
}

.docs-footer__wordmark small {
  color: var(--text-secondary);
  font-size: 0.84em;
}

.docs-footer__brand p {
  max-width: 32ch;
  margin: 16px 0 0;
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.6;
}

.docs-footer__links {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 32px;
}

.docs-footer__links section {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
}

.docs-footer__links h2 {
  margin: 0 0 4px;
  color: var(--text-primary);
  font-family: var(--font-headline);
  font-size: 14px;
  font-weight: 720;
}

.docs-footer__links a,
.docs-footer__bottom a {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.5;
  text-decoration: none;
}

.docs-footer__links a:hover,
.docs-footer__bottom a:hover {
  color: var(--color-primary);
}

.docs-footer__links a svg,
.docs-footer__links a img {
  width: 14px;
  height: 14px;
  flex: 0 0 auto;
}

.docs-footer__links a img {
  filter: var(--brand-icon-filter);
  opacity: 0.82;
}

.docs-footer__bottom {
  display: flex;
  min-height: 54px;
  border-top: 1px solid var(--color-border);
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  color: var(--text-muted);
  font-size: 12px;
}

@media (max-width: 767px) {
  .docs-footer__inner,
  .docs-footer__bottom {
    width: min(100% - 32px, 1240px);
  }

  .docs-footer__inner {
    padding: 38px 0 32px;
    grid-template-columns: 1fr;
    gap: 34px;
  }

  .docs-footer__links {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 30px 24px;
  }

  .docs-footer__links section:last-child {
    grid-column: 1 / -1;
  }

  .docs-footer__bottom {
    padding: 15px 0;
    align-items: flex-start;
    flex-direction: column;
    justify-content: center;
    gap: 4px;
  }
}
</style>
