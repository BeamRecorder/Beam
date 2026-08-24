import type {
  DocsHomeContent,
  DocsLocaleCatalogs,
  DocsPageContent,
  DocsScreenshotContent,
  DocsSectionContent,
  DocsTableContent,
} from './docs-content-types';

const quote = (value: string) => JSON.stringify(value);

const assertNonEmpty: (value: unknown, label: string) => asserts value is string = (value, label) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Docs content is missing ${label}.`);
};

const validateScreenshot = (screenshot: DocsScreenshotContent, label: string) => {
  assertNonEmpty(screenshot.path, `${label}.screenshot.path`);
  assertNonEmpty(screenshot.alt, `${label}.screenshot.alt`);
  if (screenshot.path.startsWith('/') || screenshot.path.includes('..')) {
    throw new Error(`${label}.screenshot.path must be relative to the docs screenshots directory.`);
  }
};

const validateSection = (section: DocsSectionContent, label: string) => {
  assertNonEmpty(section.title, `${label}.title`);
  if (section.notice && !['info', 'tip', 'warning'].includes(section.notice.kind)) {
    throw new Error(`${label}.notice.kind is invalid.`);
  }
  section.tables?.forEach((table, tableIndex) => {
    const tableLabel = `${label}.tables[${tableIndex}]`;
    if (!table.headers.length) throw new Error(`${tableLabel}.headers must not be empty.`);
    table.headers.forEach((header, index) => assertNonEmpty(header, `${tableLabel}.headers[${index}]`));
    if (!table.rows.length) throw new Error(`${tableLabel}.rows must not be empty.`);
    table.rows.forEach((row, rowIndex) => {
      if (row.length !== table.headers.length) {
        throw new Error(`${tableLabel}.rows[${rowIndex}] must match the header count.`);
      }
      row.forEach((cell, cellIndex) => assertNonEmpty(cell, `${tableLabel}.rows[${rowIndex}][${cellIndex}]`));
    });
  });
  section.screenshot && validateScreenshot(section.screenshot, label);
  section.subsections?.forEach((subsection, index) => validateSection(subsection, `${label}.subsections[${index}]`));
};

const escapeTableCell = (value: string) => value.replaceAll('|', '\\|').replaceAll('\n', '<br>');

const renderTable = (table: DocsTableContent): string[] => [
  `| ${table.headers.map(escapeTableCell).join(' | ')} |`,
  `| ${table.headers.map(() => '---').join(' | ')} |`,
  ...table.rows.map((row) => `| ${row.map(escapeTableCell).join(' | ')} |`),
  '',
];

export const validateDocsCatalogs = (catalogs: DocsLocaleCatalogs) => {
  assertNonEmpty(catalogs.common.locale, 'common.locale');
  assertNonEmpty(catalogs.home.title, 'home.title');
  const slugs = new Set<string>();
  for (const page of catalogs.catalogs.flatMap((catalog) => catalog.pages)) {
    assertNonEmpty(page.slug, 'page.slug');
    assertNonEmpty(page.title, `${page.slug}.title`);
    assertNonEmpty(page.description, `${page.slug}.description`);
    assertNonEmpty(page.lead, `${page.slug}.lead`);
    if (page.slug === 'index' || page.slug.startsWith('/') || page.slug.includes('..')) {
      throw new Error(`Invalid docs page slug: ${page.slug}`);
    }
    if (slugs.has(page.slug)) throw new Error(`Duplicate docs page slug: ${page.slug}`);
    slugs.add(page.slug);
    page.sections.forEach((section, index) => validateSection(section, `${page.slug}.sections[${index}]`));
  }
};

const renderScreenshot = (screenshot: DocsScreenshotContent) => {
  const props = [
    `path=${quote(screenshot.path)}`,
    `alt=${quote(screenshot.alt)}`,
    screenshot.caption ? `caption=${quote(screenshot.caption)}` : '',
    screenshot.aspectRatio ? `aspect-ratio=${quote(screenshot.aspectRatio)}` : '',
  ].filter(Boolean);
  return `<DocsScreenshot ${props.join(' ')} />`;
};

const renderSection = (section: DocsSectionContent, depth = 2): string => {
  const lines = [`${'#'.repeat(depth)} ${section.title}`, ''];
  for (const paragraph of section.paragraphs ?? []) lines.push(paragraph, '');
  for (const bullet of section.bullets ?? []) lines.push(`- ${bullet}`);
  if (section.bullets?.length) lines.push('');
  for (const [index, step] of (section.steps ?? []).entries()) lines.push(`${index + 1}. ${step}`);
  if (section.steps?.length) lines.push('');
  for (const table of section.tables ?? []) lines.push(...renderTable(table));
  if (section.notice) {
    lines.push(`::: ${section.notice.kind} ${section.notice.title}`, section.notice.text, ':::', '');
  }
  if (section.screenshot) lines.push(renderScreenshot(section.screenshot), '');
  for (const subsection of section.subsections ?? []) lines.push(renderSection(subsection, depth + 1));
  return lines.join('\n');
};

export const renderDocsPage = (page: DocsPageContent): string =>
  [
    '---',
    `title: ${quote(page.title)}`,
    `description: ${quote(page.description)}`,
    '---',
    '',
    `# ${page.title}`,
    '',
    page.lead,
    '',
    ...page.sections.map((section) => renderSection(section)),
  ].join('\n');

export const renderDocsHome = (home: DocsHomeContent): string => {
  const lines = [
    '---',
    'layout: home',
    `title: ${quote(home.title)}`,
    `description: ${quote(home.description)}`,
    'hero:',
    `  name: ${quote(home.hero.name)}`,
    `  text: ${quote(home.hero.text)}`,
    `  tagline: ${quote(home.hero.tagline)}`,
    '  image:',
    '    src: /favicon.webp',
    `    alt: ${quote(home.hero.imageAlt)}`,
    '  actions:',
  ];
  for (const action of home.hero.actions) {
    lines.push(
      `    - theme: ${action.theme}`,
      `      text: ${quote(action.text)}`,
      `      link: ${quote(action.link)}`,
    );
  }
  lines.push('---', '', '<div class="docs-product-grid">');
  for (const category of home.categories) {
    lines.push(
      `<DocsProductCard title=${quote(category.title)} details=${quote(category.details)} link=${quote(category.link)} visual=${quote(category.visual)} />`,
    );
  }
  lines.push('</div>');
  return lines.join('\n');
};
