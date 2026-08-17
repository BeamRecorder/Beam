export interface DocsScreenshotContent {
  path: string;
  alt: string;
  caption?: string;
  aspectRatio?: string;
}

export interface DocsNoticeContent {
  kind: 'info' | 'tip' | 'warning';
  title: string;
  text: string;
}

export interface DocsSectionContent {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
  steps?: string[];
  notice?: DocsNoticeContent;
  screenshot?: DocsScreenshotContent;
  subsections?: DocsSectionContent[];
}

export interface DocsPageContent {
  slug: string;
  title: string;
  description: string;
  lead: string;
  sections: DocsSectionContent[];
}

export interface DocsCatalog {
  pages: DocsPageContent[];
}

export interface DocsHomeContent {
  title: string;
  description: string;
  hero: {
    name: string;
    text: string;
    tagline: string;
    imageAlt: string;
    actions: Array<{ theme: 'brand' | 'alt'; text: string; link: string }>;
  };
  categories: Array<{ title: string; details: string; link: string; visual: 'recorder' | 'editor' }>;
}

export interface DocsCommonContent {
  locale: string;
  label: string;
  siteTitle: string;
  nav: {
    website: string;
  };
  sidebar: Array<{
    text: string;
    items: Array<{ text: string; link: string }>;
  }>;
  social: {
    github: string;
    discord: string;
  };
  theme: {
    switchToLight: string;
    switchToDark: string;
  };
  footer: {
    message: string;
    copyright: string;
  };
}

export interface DocsLocaleCatalogs {
  common: DocsCommonContent;
  home: DocsHomeContent;
  catalogs: DocsCatalog[];
}
