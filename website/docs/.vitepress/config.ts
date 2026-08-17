import { defineConfig, type HeadConfig } from 'vitepress';
import { createReadStream, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { BreadcrumbList, ListItem, WebPage, WithContext } from 'schema-dts';
import common from '../../src/i18n/en/docs/common.json';
import { enabledDocsLocales, getDocsCatalogs } from './content/docs-routes';

const siteUrl = 'https://beam.plinka.eu';
const docsUrl = `${siteUrl}/docs/`;
const socialImage = `${siteUrl}/Beam-showcase.png`;
const beamIconFile = fileURLToPath(new URL('../../public/favicon.webp', import.meta.url));
const beamShowcaseFile = fileURLToPath(new URL('../../public/Beam-showcase.png', import.meta.url));

const initialThemeScript = `(()=>{try{const e=document.documentElement,p=localStorage.getItem('beam-website-theme'),v=p==='light'||p==='dark'||p==='system'?p:'system',d=v==='dark'||v==='system'&&matchMedia('(prefers-color-scheme: dark)').matches;e.dataset.theme=v;e.classList.toggle('dark',d);e.style.colorScheme=d?'dark':'light'}catch{}})()`;

const docsPath = (relativePath: string): string => {
  const withoutExtension = relativePath.replace(/\.md$/, '');
  const normalized = withoutExtension === 'index' ? '' : withoutExtension.replace(/\/index$/, '');
  return normalized ? `/docs/${normalized}` : '/docs/';
};

const pageLocale = (relativePath: string) => {
  const prefix = relativePath.split('/')[0];
  return enabledDocsLocales.includes(prefix as (typeof enabledDocsLocales)[number])
    ? (prefix as (typeof enabledDocsLocales)[number])
    : 'en';
};

const pathWithoutLocale = (relativePath: string): string => {
  const locale = pageLocale(relativePath);
  return locale === 'en' ? relativePath : relativePath.replace(new RegExp(`^${locale}/`), '');
};

const localizedDocsPath = (relativePath: string, locale: (typeof enabledDocsLocales)[number]) => {
  const page = pathWithoutLocale(relativePath);
  return docsPath(locale === 'en' ? page : `${locale}/${page}`);
};

const safeJson = (value: object): string => JSON.stringify(value).replaceAll('<', '\\u003c');

const localizeLink = (link: string, locale: (typeof enabledDocsLocales)[number]) => {
  if (locale === 'en' || !link.startsWith('/')) return link;
  return `/${locale}${link}`;
};

const localeConfig = Object.fromEntries(
  enabledDocsLocales.map((locale) => {
    const localeCommon = getDocsCatalogs(locale).common;
    return [
      locale === 'en' ? 'root' : locale,
      {
        label: localeCommon.label,
        lang: localeCommon.locale,
        link: locale === 'en' ? '/' : `/${locale}/`,
        themeConfig: {
          siteTitle: localeCommon.siteTitle,
          nav: [
            { text: localeCommon.nav.website, link: siteUrl },
            { text: 'GitHub', link: 'https://github.com/ExtraBinoss/Beam' },
            { text: 'Discord', link: 'https://discord.gg/6Q6v2xUCB' },
          ],
          sidebar: localeCommon.sidebar.map((group) => ({
            ...group,
            items: group.items.map((item) => ({ ...item, link: localizeLink(item.link, locale) })),
          })),
          footer: localeCommon.footer,
        },
      },
    ];
  }),
);

export default defineConfig({
  lang: common.locale,
  title: common.siteTitle,
  titleTemplate: ':title | Beam Docs',
  description: 'Learn how to record, edit, and share polished product demos with Beam.',
  locales: localeConfig,
  base: '/docs/',
  cleanUrls: true,
  lastUpdated: true,
  metaChunk: true,
  appearance: false,
  outDir: '../dist/docs',
  vite: {
    plugins: [
      {
        name: 'beam-docs-assets',
        configureServer(server) {
          server.middlewares.use((request, response, next) => {
            const requestPath = request.url?.split('?')[0];
            if (requestPath === '/docs/favicon.webp') {
              response.setHeader('Content-Type', 'image/webp');
              createReadStream(beamIconFile).pipe(response);
              return;
            }
            if (requestPath === '/docs/Beam-showcase.png') {
              response.setHeader('Content-Type', 'image/png');
              createReadStream(beamShowcaseFile).pipe(response);
              return;
            }
            next();
          });
        },
        generateBundle() {
          this.emitFile({ type: 'asset', fileName: 'favicon.webp', source: readFileSync(beamIconFile) });
          this.emitFile({ type: 'asset', fileName: 'Beam-showcase.png', source: readFileSync(beamShowcaseFile) });
        },
      },
    ],
  },
  sitemap: {
    hostname: docsUrl,
  },
  head: [
    ['link', { rel: 'icon', type: 'image/webp', href: '/favicon.webp' }],
    ['meta', { name: 'theme-color', content: '#111110' }],
    ['meta', { property: 'og:site_name', content: 'Beam' }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { property: 'og:image', content: socialImage }],
    ['meta', { name: 'twitter:image', content: socialImage }],
    ['script', { id: 'beam-docs-theme' }, initialThemeScript],
  ],
  transformHead({ pageData }): HeadConfig[] {
    if (pageData.isNotFound) return [['meta', { name: 'robots', content: 'noindex' }]];
    const path = docsPath(pageData.relativePath);
    const locale = pageLocale(pageData.relativePath);
    const localeCommon = getDocsCatalogs(locale).common;
    const canonical = new URL(path, siteUrl).toString();
    const title = pageData.title ? `${pageData.title} | ${localeCommon.siteTitle}` : localeCommon.siteTitle;
    const description = pageData.description || 'Learn how to record, edit, and share with Beam.';
    const webPage: WithContext<WebPage> = {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: title,
      description,
      url: canonical,
      inLanguage: localeCommon.locale,
      isPartOf: { '@type': 'WebSite', name: 'Beam', url: siteUrl },
    };
    const items: ListItem[] = [
      { '@type': 'ListItem', position: 1, name: 'Beam', item: siteUrl },
      { '@type': 'ListItem', position: 2, name: 'Documentation', item: docsUrl },
    ];
    if (path !== '/docs/') {
      items.push({ '@type': 'ListItem', position: 3, name: pageData.title, item: canonical });
    }
    const breadcrumbs: WithContext<BreadcrumbList> = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: items,
    };

    const languageLinks: HeadConfig[] = enabledDocsLocales.map((alternateLocale) => [
      'link',
      {
        rel: 'alternate',
        hreflang: getDocsCatalogs(alternateLocale).common.locale,
        href: new URL(localizedDocsPath(pageData.relativePath, alternateLocale), siteUrl).toString(),
      },
    ]);
    languageLinks.push([
      'link',
      {
        rel: 'alternate',
        hreflang: 'x-default',
        href: new URL(localizedDocsPath(pageData.relativePath, 'en'), siteUrl).toString(),
      },
    ]);

    return [
      ['link', { rel: 'canonical', href: canonical }],
      ...languageLinks,
      ['meta', { property: 'og:title', content: title }],
      ['meta', { property: 'og:description', content: description }],
      ['meta', { property: 'og:type', content: 'website' }],
      ['meta', { property: 'og:url', content: canonical }],
      ['meta', { name: 'twitter:title', content: title }],
      ['meta', { name: 'twitter:description', content: description }],
      ['script', { id: 'beam-docs-web-page', type: 'application/ld+json' }, safeJson(webPage)],
      ['script', { id: 'beam-docs-breadcrumbs', type: 'application/ld+json' }, safeJson(breadcrumbs)],
    ];
  },
  themeConfig: {
    logo: '/favicon.webp',
    siteTitle: common.siteTitle,
    search: { provider: 'local' },
    outline: { level: [2, 3], label: 'On this page' },
    externalLinkIcon: true,
  },
});
