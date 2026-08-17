<script setup lang="ts">
import { ExternalLink } from '@lucide/vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { normalizeWebsiteLocale } from '@website/i18n';
import { REPOSITORY_URL } from '@website/seo/site';

const { locale, t } = useI18n();
const isFrench = computed(() => normalizeWebsiteLocale(locale.value) === 'fr');

const comparisonLinks = [
  ['Screen Studio', 'beam-vs-screen-studio'],
  ['Tella', 'beam-vs-tella'],
  ['OpenScreen', 'beam-vs-openscreen'],
  ['OBS Studio', 'beam-vs-obs'],
  ['Loom', 'beam-vs-loom'],
] as const;
</script>

<template>
  <footer class="site-footer">
    <div class="site-shell site-footer__grid">
      <div class="site-footer__brand">
        <strong>Beam</strong>
        <p>{{ t('Website.home.footer') }}</p>
        <span>Windows · macOS · Linux</span>
      </div>

      <nav :aria-label="isFrench ? 'Liens Beam' : 'Beam links'">
        <strong>{{ isFrench ? 'Produit' : 'Product' }}</strong>
        <a href="/install">{{ isFrench ? 'Télécharger Beam' : 'Download Beam' }}</a>
        <a href="/docs/">{{ isFrench ? 'Documentation' : 'Documentation' }}</a>
        <a href="/faq">FAQ</a>
        <a :href="REPOSITORY_URL" target="_blank" rel="noreferrer"> GitHub <ExternalLink aria-hidden="true" /> </a>
      </nav>

      <nav :aria-label="isFrench ? 'Comparatifs Beam' : 'Compare Beam'">
        <strong>{{ isFrench ? 'Comparer Beam' : 'Compare Beam' }}</strong>
        <a v-for="[name, id] in comparisonLinks" :key="id" :href="`/faq#${id}`">Beam vs {{ name }}</a>
      </nav>

      <nav :aria-label="isFrench ? 'Communauté Beam' : 'Beam community'">
        <strong>{{ isFrench ? 'Communauté' : 'Community' }}</strong>
        <a href="https://discord.gg/6Q6v2xUCB" target="_blank" rel="noreferrer">Discord</a>
        <a :href="`${REPOSITORY_URL}/issues`" target="_blank" rel="noreferrer">
          {{ isFrench ? 'Signaler un bug' : 'Report an issue' }} <ExternalLink aria-hidden="true" />
        </a>
        <a :href="`${REPOSITORY_URL}/blob/master/LICENSE`" target="_blank" rel="noreferrer">MIT License</a>
      </nav>
    </div>
  </footer>
</template>

<style scoped>
.site-footer {
  margin-top: 88px;
  border-top: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-bg-surface) 72%, transparent);
}

.site-footer__grid {
  display: grid;
  padding: 48px 0 56px;
  grid-template-columns: minmax(220px, 1.5fr) repeat(3, minmax(140px, 1fr));
  gap: 40px;
}

.site-footer__brand,
.site-footer nav {
  display: flex;
  align-items: flex-start;
  flex-direction: column;
}

.site-footer strong {
  color: var(--text-primary);
  font-family: var(--font-headline);
  font-size: 14px;
  font-weight: 740;
}

.site-footer__brand > strong {
  font-size: 21px;
}

.site-footer__brand p {
  max-width: 280px;
  margin-top: 10px;
  color: var(--text-secondary);
  line-height: 1.6;
}

.site-footer__brand span {
  margin-top: 18px;
  color: var(--text-muted);
  font-size: 13px;
}

.site-footer nav {
  gap: 11px;
}

.site-footer nav strong {
  margin-bottom: 4px;
}

.site-footer a {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--text-secondary);
  font-size: 13px;
  text-decoration: none;
  transition: color 150ms ease;
}

.site-footer a:hover {
  color: var(--color-primary);
}

.site-footer a svg {
  width: 13px;
  height: 13px;
}

@media (max-width: 820px) {
  .site-footer__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 520px) {
  .site-footer__grid {
    grid-template-columns: 1fr;
    gap: 32px;
  }
}
</style>
