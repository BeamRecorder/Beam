import type { FAQPage, Question, SoftwareApplication, WebSite, WithContext } from 'schema-dts';
import { faqItems, type FaqItem } from './faq-content';
import { absoluteSiteUrl, RELEASES_URL, REPOSITORY_URL, SITE_NAME, SITE_URL, SOCIAL_IMAGE_PATH } from './site';

export type WebsiteJsonLd = WithContext<WebSite> | WithContext<SoftwareApplication> | WithContext<FAQPage>;

export const createHomeJsonLd = (): readonly [WithContext<WebSite>, WithContext<SoftwareApplication>] => [
  {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: SITE_URL,
    description:
      'Free, open-source screen recorder and video editor for polished product demos on Windows, macOS, and Linux.',
  },
  {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: SITE_NAME,
    url: SITE_URL,
    description:
      'Free, open-source screen recorder and video editor for polished product demos on Windows, macOS, and Linux.',
    applicationCategory: 'MultimediaApplication',
    operatingSystem: 'Windows, macOS, Linux',
    downloadUrl: RELEASES_URL,
    image: absoluteSiteUrl(SOCIAL_IMAGE_PATH),
    license: `${REPOSITORY_URL}/blob/master/LICENSE`,
  },
];

export const createFaqJsonLd = (items: readonly FaqItem[] = faqItems): WithContext<FAQPage> => ({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: items.map(({ question, answer }): Question => ({
    '@type': 'Question',
    name: question,
    acceptedAnswer: {
      '@type': 'Answer',
      text: answer,
    },
  })),
});
