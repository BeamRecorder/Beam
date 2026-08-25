import { useHead, useSeoMeta } from '@unhead/vue';
import { toValue, type MaybeRefOrGetter } from 'vue';
import type { WebsiteJsonLd } from './json-ld';
import { absoluteSiteUrl, canonicalUrl, SITE_NAME, SOCIAL_IMAGE_PATH } from './site';

export interface PageSeo {
  path: string;
  title: MaybeRefOrGetter<string>;
  description: MaybeRefOrGetter<string>;
  jsonLd: MaybeRefOrGetter<readonly WebsiteJsonLd[]>;
}

const serializeJsonLd = (value: WebsiteJsonLd): string => JSON.stringify(value).replaceAll('<', '\\u003c');

export const usePageSeo = ({ path, title, description, jsonLd }: PageSeo): void => {
  const canonical = canonicalUrl(path);
  const image = absoluteSiteUrl(SOCIAL_IMAGE_PATH);

  useSeoMeta({
    title: () => toValue(title),
    description: () => toValue(description),
    ogTitle: () => toValue(title),
    ogDescription: () => toValue(description),
    ogType: 'website',
    ogUrl: canonical,
    ogImage: image,
    ogSiteName: SITE_NAME,
    twitterCard: 'summary_large_image',
    twitterTitle: () => toValue(title),
    twitterDescription: () => toValue(description),
    twitterImage: image,
  });

  useHead(() => ({
    link: [{ rel: 'canonical', href: canonical }],
    script: toValue(jsonLd).map((value, index) => ({
      id: `beam-json-ld-${index + 1}`,
      type: 'application/ld+json',
      innerHTML: serializeJsonLd(value),
    })),
  }));
};
