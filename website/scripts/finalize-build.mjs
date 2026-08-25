import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

export const findHtmlFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return findHtmlFiles(entryPath);
      return entry.isFile() && entry.name.endsWith('.html') ? [entryPath] : [];
    }),
  );
  return files.flat().sort();
};

export const extractInlineScripts = (html) =>
  [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter((match) => !/\btype=["']application\/(?:ld\+)?json["']/i.test(match[1]))
    .map((match) => match[2])
    .filter((content) => content.length > 0);

export const hashInlineScript = (content) =>
  `'sha256-${createHash('sha256').update(content, 'utf8').digest('base64')}'`;

export const renderHeaders = (template, scripts) => {
  const hashes = [...new Set(scripts.map(hashInlineScript))].sort().join(' ');
  const rendered = template.replace('{{SCRIPT_HASHES}}', hashes);
  if (rendered.includes('{{SCRIPT_HASHES}}')) throw new Error('CSP template placeholder was not replaced.');
  const cspLine = rendered.split('\n').find((line) => line.includes('Content-Security-Policy'));
  if (!cspLine || cspLine.length > 2_000) throw new Error('Generated CSP is missing or exceeds 2,000 characters.');
  return rendered;
};

const countMatches = (value, pattern) => [...value.matchAll(pattern)].length;

export const validateSeoHtml = (html, fileName) => {
  const requiredPatterns = [
    [/<title>[^<]+<\/title>/gi, 'title'],
    [/<meta\s+name="description"\s+content="[^"]+"/gi, 'description'],
    [/<link\s+rel="canonical"\s+href="https:\/\/beam\.plinka\.eu\/[^"]*"/gi, 'canonical'],
    [/<meta\s+property="og:title"\s+content="[^"]+"/gi, 'Open Graph title'],
    [/<meta\s+name="twitter:card"\s+content="summary_large_image"/gi, 'Twitter card'],
    [/<h1\b/gi, 'H1'],
  ];
  for (const [pattern, label] of requiredPatterns) {
    if (countMatches(html, pattern) !== 1) throw new Error(`${fileName} must contain exactly one ${label}.`);
  }
  const jsonLdScripts = [...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
  if (!jsonLdScripts.length) throw new Error(`${fileName} must contain JSON-LD.`);
  for (const script of jsonLdScripts) JSON.parse(script[1]);
};

const validateTextFile = async (fileName, expectedValues) => {
  const content = await readFile(fileName, 'utf8');
  for (const value of expectedValues) {
    if (!content.includes(value)) throw new Error(`${fileName} is missing ${value}.`);
  }
};

export const validateSitemap = (sitemap, fileName, origin = 'https://beam.plinka.eu') => {
  const urls = [...sitemap.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/g)].map((match) => new URL(match[1].trim()));
  const seen = new Set();

  for (const url of urls) {
    if (url.origin !== origin) throw new Error(`${fileName} contains an unexpected origin: ${url.origin}`);
    if (url.pathname === '/404' || url.pathname.endsWith('/404')) {
      throw new Error(`${fileName} must not contain a 404 URL: ${url.href}`);
    }
    if (seen.has(url.href)) throw new Error(`${fileName} contains a duplicate URL: ${url.href}`);
    seen.add(url.href);
  }
};

export const deduplicateSitemap = (sitemap) => {
  const seen = new Set();
  return sitemap.replace(/\s*<url>[^]*?<\/url>/g, (entry) => {
    const location = entry.match(/<loc>\s*([^<]+)\s*<\/loc>/)?.[1].trim();
    if (!location || seen.has(location)) return '';
    seen.add(location);
    return entry;
  });
};

export const sitemapHtmlFiles = (sitemap, origin = 'https://beam.plinka.eu') => [
  ...new Set(
    [...sitemap.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/g)].flatMap((match) => {
      const url = new URL(match[1].trim());
      if (url.origin !== origin) throw new Error(`Unexpected sitemap origin: ${url.origin}`);
      const pathname = decodeURIComponent(url.pathname);
      if (pathname === '/404' || pathname.endsWith('/404')) return [];
      return pathname.endsWith('/') ? [`${pathname.slice(1)}index.html`] : [`${pathname.slice(1)}.html`];
    }),
  ),
];

export const finalizeBuild = async (options = {}) => {
  const websiteRoot = fileURLToPath(new URL('..', import.meta.url));
  const distDir = options.distDir ?? path.join(websiteRoot, 'dist');
  const templateFile = options.templateFile ?? path.join(websiteRoot, 'config', '_headers.template');
  const docsSitemapFile = path.join(distDir, 'docs', 'sitemap.xml');
  const docsSitemap = await readFile(docsSitemapFile, 'utf8');
  const rootSitemapFile = path.join(distDir, 'sitemap.xml');
  const rootSitemap = deduplicateSitemap(await readFile(rootSitemapFile, 'utf8'));
  await writeFile(rootSitemapFile, rootSitemap, 'utf8');
  validateSitemap(rootSitemap, rootSitemapFile);
  validateSitemap(docsSitemap, docsSitemapFile);
  const seoFiles = ['index.html', 'faq.html', 'install.html', ...sitemapHtmlFiles(docsSitemap)];
  for (const relativeFile of seoFiles) {
    const html = await readFile(path.join(distDir, relativeFile), 'utf8');
    validateSeoHtml(html, relativeFile);
  }

  await writeFile(
    path.join(distDir, 'robots.txt'),
    [
      'User-agent: *',
      'Allow: /',
      '',
      'Sitemap: https://beam.plinka.eu/sitemap.xml',
      'Sitemap: https://beam.plinka.eu/docs/sitemap.xml',
      '',
    ].join('\n'),
    'utf8',
  );

  await validateTextFile(path.join(distDir, '404.html'), ['name="robots" content="noindex"']);
  await validateTextFile(path.join(distDir, 'docs', '404.html'), ['name="robots" content="noindex"']);
  await validateTextFile(path.join(distDir, 'robots.txt'), [
    'Sitemap: https://beam.plinka.eu/sitemap.xml',
    'Sitemap: https://beam.plinka.eu/docs/sitemap.xml',
  ]);
  await validateTextFile(path.join(distDir, 'sitemap.xml'), [
    'https://beam.plinka.eu/',
    'https://beam.plinka.eu/faq',
    'https://beam.plinka.eu/install',
  ]);
  await validateTextFile(docsSitemapFile, [
    'https://beam.plinka.eu/docs/',
    'https://beam.plinka.eu/docs/getting-started',
    'https://beam.plinka.eu/docs/updates',
    'https://beam.plinka.eu/docs/recorder/',
    'https://beam.plinka.eu/docs/recorder/interface',
    'https://beam.plinka.eu/docs/recorder/capabilities',
    'https://beam.plinka.eu/docs/editor/',
    'https://beam.plinka.eu/docs/editor/interface',
    'https://beam.plinka.eu/docs/editor/capabilities',
    'https://beam.plinka.eu/docs/export',
    'https://beam.plinka.eu/docs/platforms',
    'https://beam.plinka.eu/docs/filesystem',
  ]);

  const htmlFiles = await findHtmlFiles(distDir);
  const htmlDocuments = await Promise.all(htmlFiles.map((fileName) => readFile(fileName, 'utf8')));
  const scripts = htmlDocuments.flatMap(extractInlineScripts);
  const template = await readFile(templateFile, 'utf8');
  await writeFile(path.join(distDir, '_headers'), renderHeaders(template, scripts), 'utf8');
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await finalizeBuild();
  console.log('[website] SEO output and CSP validated.');
}
