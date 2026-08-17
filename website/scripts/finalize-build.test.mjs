import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import {
  extractInlineScripts,
  hashInlineScript,
  renderHeaders,
  deduplicateSitemap,
  sitemapHtmlFiles,
  validateSitemap,
  validateSeoHtml,
} from './finalize-build.mjs';

const execFileAsync = promisify(execFile);

const validSeoHtml = `
  <html><head>
    <title>Beam</title>
    <meta name="description" content="Beam description">
    <link rel="canonical" href="https://beam.plinka.eu/faq">
    <meta property="og:title" content="Beam">
    <meta name="twitter:card" content="summary_large_image">
    <script type="application/ld+json">{"@type":"WebSite"}</script>
  </head><body><h1>Beam</h1></body></html>`;

describe('build finalizer', () => {
  it('extracts inline scripts but skips external and empty scripts', () => {
    const html =
      '<script src="/app.js"></script><script>one()</script><script>two()</script><script type="application/ld+json">{"name":"Beam"}</script><script></script>';
    expect(extractInlineScripts(html)).toEqual(['one()', 'two()']);
  });

  it('creates deterministic and content-sensitive SHA-256 hashes', () => {
    expect(hashInlineScript('one()')).toMatch(/^'sha256-[A-Za-z0-9+/]+=*'$/);
    expect(hashInlineScript('one()')).toBe(hashInlineScript('one()'));
    expect(hashInlineScript('one()')).not.toBe(hashInlineScript('two()'));
  });

  it('deduplicates hashes when rendering the CSP template', () => {
    const rendered = renderHeaders('Content-Security-Policy: script-src {{SCRIPT_HASHES}}', [
      'one()',
      'one()',
      'two()',
    ]);
    expect(rendered.match(/'sha256-/g)).toHaveLength(2);
    expect(rendered).not.toContain('{{SCRIPT_HASHES}}');
  });

  it('rejects an oversized CSP header', () => {
    const scripts = Array.from({ length: 50 }, (_, index) => `script-${index}`);
    expect(() => renderHeaders('Content-Security-Policy: script-src {{SCRIPT_HASHES}}', scripts)).toThrow(
      'exceeds 2,000 characters',
    );
  });

  it('accepts complete SEO HTML with parseable JSON-LD', () => {
    expect(() => validateSeoHtml(validSeoHtml, 'valid.html')).not.toThrow();
  });

  it('rejects duplicate required metadata', () => {
    expect(() =>
      validateSeoHtml(validSeoHtml.replace('</title>', '</title><title>Duplicate</title>'), 'bad.html'),
    ).toThrow('exactly one title');
  });

  it('rejects malformed JSON-LD', () => {
    expect(() => validateSeoHtml(validSeoHtml.replace('{"@type":"WebSite"}', '{bad json}'), 'bad.html')).toThrow();
  });

  it('accepts a sitemap with unique same-origin URLs', () => {
    const sitemap = `
      <urlset>
        <url><loc>https://beam.plinka.eu/</loc></url>
        <url><loc>https://beam.plinka.eu/faq</loc></url>
        <url><loc>https://beam.plinka.eu/docs/</loc></url>
      </urlset>`;

    expect(() => validateSitemap(sitemap, 'sitemap.xml')).not.toThrow();
  });

  it('rejects duplicate sitemap URLs', () => {
    const sitemap = `
      <urlset>
        <url><loc>https://beam.plinka.eu/faq</loc></url>
        <url><loc>https://beam.plinka.eu/faq</loc></url>
      </urlset>`;

    expect(() => validateSitemap(sitemap, 'sitemap.xml')).toThrow('contains a duplicate URL');
  });

  it('rejects root and nested 404 URLs from a sitemap', () => {
    expect(() => validateSitemap('<loc>https://beam.plinka.eu/404</loc>', 'sitemap.xml')).toThrow(
      'must not contain a 404 URL',
    );
    expect(() => validateSitemap('<loc>https://beam.plinka.eu/docs/404</loc>', 'docs/sitemap.xml')).toThrow(
      'must not contain a 404 URL',
    );
  });

  it('rejects sitemap URLs from another origin', () => {
    expect(() => validateSitemap('<loc>https://example.com/docs/</loc>', 'sitemap.xml')).toThrow(
      'contains an unexpected origin',
    );
  });

  it('deduplicates sitemap entries while preserving the first entry and its metadata', () => {
    const firstFaq =
      '<url><loc>https://beam.plinka.eu/faq</loc><lastmod>2026-08-17</lastmod><priority>0.7</priority></url>';
    const duplicateFaq =
      '<url><loc>https://beam.plinka.eu/faq</loc><lastmod>2026-08-18</lastmod><priority>1.0</priority></url>';
    const install = '<url><loc>https://beam.plinka.eu/install</loc><priority>0.8</priority></url>';

    expect(deduplicateSitemap(`<urlset>${firstFaq}${duplicateFaq}${install}</urlset>`)).toBe(
      `<urlset>${firstFaq}${install}</urlset>`,
    );
  });

  it('does not merge distinct sitemap URLs', () => {
    const sitemap = `
      <urlset>
        <url><loc>https://beam.plinka.eu/faq</loc></url>
        <url><loc>https://beam.plinka.eu/faq?source=docs</loc></url>
        <url><loc>https://beam.plinka.eu/faq/</loc></url>
      </urlset>`;

    const deduplicated = deduplicateSitemap(sitemap);
    expect(deduplicated.match(/<url>/g)).toHaveLength(3);
    expect(deduplicated).toContain('https://beam.plinka.eu/faq?source=docs');
    expect(deduplicated).toContain('https://beam.plinka.eu/faq/');
  });

  it('maps clean and directory sitemap URLs to their generated HTML files', () => {
    const sitemap = `
      <urlset>
        <url><loc>https://beam.plinka.eu/docs/</loc></url>
        <url><loc>https://beam.plinka.eu/docs/recorder/</loc></url>
        <url><loc>https://beam.plinka.eu/docs/editor/interface</loc></url>
      </urlset>`;
    expect(sitemapHtmlFiles(sitemap)).toEqual([
      'docs/index.html',
      'docs/recorder/index.html',
      'docs/editor/interface.html',
    ]);
  });

  it('deduplicates sitemap entries and excludes root and docs 404 pages', () => {
    const sitemap = `
      <urlset>
        <url><loc>https://beam.plinka.eu/docs/</loc></url>
        <url><loc>https://beam.plinka.eu/docs/</loc></url>
        <url><loc>https://beam.plinka.eu/docs/404</loc></url>
        <url><loc>https://beam.plinka.eu/404</loc></url>
        <url><loc>https://beam.plinka.eu/docs/recorder/</loc></url>
        <url><loc>https://beam.plinka.eu/docs/recorder/</loc></url>
      </urlset>`;

    expect(sitemapHtmlFiles(sitemap)).toEqual(['docs/index.html', 'docs/recorder/index.html']);
  });

  it('rewrites robots.txt instead of preserving stale build output', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'beam-finalizer-test-'));
    const distDir = path.join(tempRoot, 'dist');
    const docsDir = path.join(distDir, 'docs');
    const templateFile = path.join(tempRoot, 'headers.template');
    const docsPages = [
      ['docs/index.html', 'https://beam.plinka.eu/docs/'],
      ['docs/getting-started.html', 'https://beam.plinka.eu/docs/getting-started'],
      ['docs/updates.html', 'https://beam.plinka.eu/docs/updates'],
      ['docs/recorder/index.html', 'https://beam.plinka.eu/docs/recorder/'],
      ['docs/recorder/interface.html', 'https://beam.plinka.eu/docs/recorder/interface'],
      ['docs/recorder/capabilities.html', 'https://beam.plinka.eu/docs/recorder/capabilities'],
      ['docs/editor/index.html', 'https://beam.plinka.eu/docs/editor/'],
      ['docs/editor/interface.html', 'https://beam.plinka.eu/docs/editor/interface'],
      ['docs/editor/capabilities.html', 'https://beam.plinka.eu/docs/editor/capabilities'],
      ['docs/export.html', 'https://beam.plinka.eu/docs/export'],
      ['docs/platforms.html', 'https://beam.plinka.eu/docs/platforms'],
      ['docs/filesystem.html', 'https://beam.plinka.eu/docs/filesystem'],
    ];
    const seoHtml = (canonical) => `
      <html><head>
        <title>Beam</title>
        <meta name="description" content="Beam description">
        <link rel="canonical" href="${canonical}">
        <meta property="og:title" content="Beam">
        <meta name="twitter:card" content="summary_large_image">
        <script type="application/ld+json">{"@type":"WebPage"}</script>
      </head><body><h1>Beam</h1></body></html>`;

    try {
      await mkdir(docsDir, { recursive: true });
      await Promise.all(
        docsPages.map(([relativeFile, canonical]) =>
          mkdir(path.dirname(path.join(distDir, relativeFile)), { recursive: true }).then(() =>
            writeFile(path.join(distDir, relativeFile), seoHtml(canonical)),
          ),
        ),
      );
      await writeFile(path.join(distDir, 'index.html'), seoHtml('https://beam.plinka.eu/'));
      await writeFile(path.join(distDir, 'faq.html'), seoHtml('https://beam.plinka.eu/faq'));
      await writeFile(path.join(distDir, 'install.html'), seoHtml('https://beam.plinka.eu/install'));
      await writeFile(path.join(distDir, '404.html'), '<meta name="robots" content="noindex">');
      await writeFile(path.join(docsDir, '404.html'), '<meta name="robots" content="noindex">');
      await writeFile(
        path.join(distDir, 'sitemap.xml'),
        '<loc>https://beam.plinka.eu/</loc><loc>https://beam.plinka.eu/faq</loc><loc>https://beam.plinka.eu/install</loc>',
      );
      await writeFile(
        path.join(docsDir, 'sitemap.xml'),
        `<urlset>${docsPages.map(([, canonical]) => `<url><loc>${canonical}</loc></url>`).join('')}</urlset>`,
      );
      await writeFile(path.join(distDir, 'robots.txt'), 'stale robots content\n');
      await writeFile(templateFile, 'Content-Security-Policy: script-src {{SCRIPT_HASHES}}\n');

      const finalizerUrl = pathToFileURL(path.join(process.cwd(), 'scripts/finalize-build.mjs')).href;
      const finalizerScript = `import { finalizeBuild } from ${JSON.stringify(finalizerUrl)}; await finalizeBuild(${JSON.stringify({ distDir, templateFile })});`;
      await execFileAsync(process.execPath, ['--input-type=module', '--eval', finalizerScript]);

      expect(await readFile(path.join(distDir, 'robots.txt'), 'utf8')).toBe(
        [
          'User-agent: *',
          'Allow: /',
          '',
          'Sitemap: https://beam.plinka.eu/sitemap.xml',
          'Sitemap: https://beam.plinka.eu/docs/sitemap.xml',
          '',
        ].join('\n'),
      );
      expect(await readFile(path.join(distDir, 'robots.txt'), 'utf8')).not.toContain('stale');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('rejects sitemap entries from another origin', () => {
    expect(() => sitemapHtmlFiles('<loc>https://example.com/docs/</loc>')).toThrow('Unexpected sitemap origin');
  });
});
