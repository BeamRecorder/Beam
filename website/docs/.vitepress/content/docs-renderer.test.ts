import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { DocsLocaleCatalogs, DocsPageContent, DocsSectionContent } from './docs-content-types';
import { createDocsRoutes, docsRoutePaths, getDocsCatalogs } from './docs-routes';
import { renderDocsHome, renderDocsPage, validateDocsCatalogs } from './docs-renderer';

const websiteRoot = basename(process.cwd()) === 'website' ? process.cwd() : join(process.cwd(), 'website');
const docsScreenshotsDirectory = join(websiteRoot, 'docs/public/screenshots');

const collectScreenshotPaths = (sections: readonly DocsSectionContent[]): string[] =>
  sections.flatMap((currentSection) => [
    ...(currentSection.screenshot ? [currentSection.screenshot.path] : []),
    ...(currentSection.subsections ? collectScreenshotPaths(currentSection.subsections) : []),
  ]);

const page = (overrides: Partial<DocsPageContent> = {}): DocsPageContent => ({
  slug: 'getting-started',
  title: 'Getting started',
  description: 'Start using Beam.',
  lead: 'Create a recording in a few steps.',
  sections: [],
  ...overrides,
});

const catalog = (overrides: Partial<DocsLocaleCatalogs> = {}): DocsLocaleCatalogs => ({
  common: {
    locale: 'en-US',
    label: 'English',
    siteTitle: 'Beam Docs',
    nav: { website: 'Beam website' },
    sidebar: [],
    social: { github: 'GitHub', discord: 'Discord' },
    theme: { switchToLight: 'Light theme', switchToDark: 'Dark theme' },
    footer: { message: 'Beam', copyright: 'MIT' },
  },
  home: {
    title: 'Beam documentation',
    description: 'Beam docs.',
    hero: {
      name: 'Beam Docs',
      text: 'Record. Edit. Share.',
      tagline: 'Practical Beam guides.',
      imageAlt: 'Beam app icon',
      actions: [{ theme: 'brand', text: 'Get started', link: '/getting-started' }],
    },
    categories: [{ title: 'Recorder', details: 'Record a screen.', link: '/recorder/', visual: 'recorder' }],
  },
  catalogs: [{ pages: [page()] }],
  ...overrides,
});

const section = (overrides: Partial<DocsSectionContent> = {}): DocsSectionContent => ({
  title: 'Capture sources',
  paragraphs: ['Choose a display or window.'],
  bullets: ['Display', 'Window'],
  steps: ['Choose a source', 'Start recording'],
  notice: { kind: 'tip', title: 'Tip', text: 'Keep the source visible.' },
  tables: [
    {
      headers: ['Source', 'Use it when'],
      rows: [
        ['Display', 'You need the whole screen.'],
        ['Window', 'You need one application window.'],
      ],
    },
  ],
  screenshot: {
    path: 'recorder/source.webp',
    alt: 'Beam capture source picker',
    caption: 'Choose what to record.',
    aspectRatio: '4 / 3',
  },
  subsections: [{ title: 'Region capture', paragraphs: ['Crop a custom region.'] }],
  ...overrides,
});

describe('docs content renderer', () => {
  it('renders page frontmatter, structured sections, notices, screenshots, and nested headings', () => {
    const rendered = renderDocsPage(page({ sections: [section()] }));

    expect(rendered).toContain('title: "Getting started"');
    expect(rendered).toContain('description: "Start using Beam."');
    expect(rendered).toContain('# Getting started');
    expect(rendered).toContain('Create a recording in a few steps.');
    expect(rendered).toContain('## Capture sources');
    expect(rendered).toContain('- Display\n- Window');
    expect(rendered).toContain('1. Choose a source\n2. Start recording');
    expect(rendered).toContain(
      'Choose a display or window.\n\n- Display\n- Window\n\n1. Choose a source\n2. Start recording\n\n| Source | Use it when |\n| --- | --- |\n| Display | You need the whole screen. |\n| Window | You need one application window. |\n\n::: tip Tip',
    );
    expect(rendered).toContain('::: tip Tip\nKeep the source visible.\n:::');
    expect(rendered).toContain(
      '<DocsScreenshot path="recorder/source.webp" alt="Beam capture source picker" caption="Choose what to record." aspect-ratio="4 / 3" />',
    );
    expect(rendered).toContain('### Region capture');
  });

  it('renders the docs home frontmatter, hero, actions, and categories from one catalog', () => {
    const rendered = renderDocsHome(catalog().home);

    expect(rendered).toContain('layout: home');
    expect(rendered).toContain('title: "Beam documentation"');
    expect(rendered).toContain('name: "Beam Docs"');
    expect(rendered).toContain('tagline: "Practical Beam guides."');
    expect(rendered).toContain('text: "Get started"');
    expect(rendered).toContain('link: "/getting-started"');
    expect(rendered).toContain(
      '<DocsProductCard title="Recorder" details="Record a screen." link="/recorder/" visual="recorder" />',
    );
  });

  it('rejects duplicate, unsafe, or incomplete page and screenshot data', () => {
    expect(() => validateDocsCatalogs(catalog({ catalogs: [{ pages: [page(), page()] }] }))).toThrow(
      'Duplicate docs page slug',
    );
    expect(() => validateDocsCatalogs(catalog({ catalogs: [{ pages: [page({ slug: 'index' })] }] }))).toThrow(
      'Invalid docs page slug',
    );
    expect(() => validateDocsCatalogs(catalog({ catalogs: [{ pages: [page({ slug: '../private' })] }] }))).toThrow(
      'Invalid docs page slug',
    );
    expect(() =>
      validateDocsCatalogs(
        catalog({
          catalogs: [{ pages: [page({ sections: [section({ screenshot: { path: '../secret.webp', alt: 'x' } })] })] }],
        }),
      ),
    ).toThrow('must be relative to the docs screenshots directory');
    expect(() =>
      validateDocsCatalogs(
        catalog({
          catalogs: [{ pages: [page({ sections: [section({ screenshot: { path: 'x.webp', alt: '' } })] })] }],
        }),
      ),
    ).toThrow('screenshot.alt');
    expect(() =>
      validateDocsCatalogs(
        catalog({
          catalogs: [
            {
              pages: [
                page({
                  sections: [
                    section({
                      tables: [{ headers: ['Setting', 'Value'], rows: [['Only one cell']] }],
                    }),
                  ],
                }),
              ],
            },
          ],
        }),
      ),
    ).toThrow('must match the header count');
  });

  it('validates the real English catalog and renders every declared route exactly once', () => {
    const content = getDocsCatalogs('en');
    expect(() => validateDocsCatalogs(content)).not.toThrow();

    const routes = createDocsRoutes('en');
    expect(routes).toHaveLength(28);
    expect(routes.map((route) => route.params.page)).toEqual([
      'index',
      'getting-started',
      'updates',
      'recorder/index',
      'recorder/interface',
      'recorder/capabilities/index',
      'recorder/capabilities/capture-sources',
      'recorder/capabilities/audio-camera',
      'recorder/capabilities/teleprompter',
      'recorder/capabilities/live-controls',
      'recorder/capabilities/preferences',
      'recorder/capabilities/project-manager',
      'recorder/capabilities/permissions-privacy',
      'editor/index',
      'editor/interface',
      'editor/capabilities',
      'editor/capabilities/timeline',
      'editor/capabilities/clips',
      'editor/capabilities/canvas',
      'editor/capabilities/zooms',
      'editor/capabilities/cursor',
      'editor/capabilities/captions',
      'editor/capabilities/audio',
      'editor/capabilities/settings',
      'editor/showcase',
      'export',
      'platforms',
      'filesystem',
    ]);
    expect(routes.every((route) => route.content.includes('---'))).toBe(true);
    expect(routes[0]?.content).toContain('layout: home');
    expect(routes[0]?.content).toContain('name: "Beam Docs"');
    expect(routes[0]?.content).toContain('<div class="docs-product-grid">');
    expect(routes[0]?.content).toContain(
      '<DocsProductCard title="Recorder app" details="Choose a source, prepare audio and camera tracks, then control the recording from the compact HUD." link="/recorder/" visual="recorder" />',
    );
    expect(routes[0]?.content).toContain(
      '<DocsProductCard title="Video editor" details="Shape timing, framing, zooms, cursor motion, captions, sound, and export from one workspace." link="/editor/" visual="editor" />',
    );
    expect(routes[0]?.content.match(/<DocsProductCard /g)).toHaveLength(2);
    expect(routes.slice(1).every((route) => /\n# .+\n/.test(route.content))).toBe(true);

    const filesystemRoute = routes.find((route) => route.params.page === 'filesystem');
    expect(filesystemRoute?.content).toContain('<KeyboardChip shortcut="Win+R" />');
    expect(filesystemRoute?.content).toContain('<KeyboardChip shortcut="Command+Shift+G" />');
    expect(filesystemRoute?.content).toContain('<KeyboardChip shortcut="Ctrl+L" />');
    expect(filesystemRoute?.content).not.toContain('&lt;KeyboardChip');
  });

  it('renders every English WebP screenshot and resolves its copied asset', () => {
    const content = getDocsCatalogs('en');
    const webpPaths = [
      ...new Set(
        content.catalogs
          .flatMap((catalog) => catalog.pages)
          .flatMap((pageContent) => collectScreenshotPaths(pageContent.sections))
          .filter((path) => path.endsWith('.webp')),
      ),
    ].sort();
    const expectedWebpPaths = [
      'editor/audio-panel.webp',
      'editor/canvas-panel.webp',
      'editor/captions-panel.webp',
      'editor/clip-empty.webp',
      'editor/cursor-panel.webp',
      'editor/interface-overview.webp',
      'editor/settings-panel.webp',
      'editor/showcase.webp',
      'editor/webcam-properties.webp',
      'editor/zoom-empty.webp',
      'editor/zoom-properties.webp',
      'recorder/hud-overview.webp',
      'recorder/preferences.webp',
      'reference/export-panel.webp',
    ].sort();
    const routes = createDocsRoutes('en');

    expect(webpPaths).toEqual(expect.arrayContaining(expectedWebpPaths));
    for (const path of expectedWebpPaths) {
      expect(existsSync(join(docsScreenshotsDirectory, path)), `copied screenshot ${path}`).toBe(true);
      expect(
        routes.some((route) => route.content.includes(`path="${path}"`)),
        `rendered screenshot ${path}`,
      ).toBe(true);
    }
  });

  it('normalizes index routes to the docs root for clean URLs', () => {
    expect(docsRoutePaths()).toContain('/');
    expect(docsRoutePaths()).toContain('recorder/');
    expect(docsRoutePaths()).toContain('editor/');
    expect(docsRoutePaths()).not.toContain('index');
  });
});
