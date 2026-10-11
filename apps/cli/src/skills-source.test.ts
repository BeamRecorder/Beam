// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assertSkillPathSafe,
  hashSkillFile,
  loadSkillsSource,
  parseSkillsManifest,
  safeSkillPath,
} from './skills-source';
import { runSkillsCommand } from './skills';

const directories: string[] = [];
const sha = 'a'.repeat(40);
const content = 'Beam agent instructions';
const manifest = () => ({
  schemaVersion: 1,
  version: '1.0.0',
  skills: [{ name: 'beam-cli', description: 'Beam', files: { 'SKILL.md': hashSkillFile(content) } }],
});
afterEach(async () => {
  vi.restoreAllMocks();
  process.exitCode = 0;
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});
async function temporary() {
  const directory = await mkdtemp(join(tmpdir(), 'beam-skills-source-'));
  directories.push(directory);
  return directory;
}

it('accepts a bounded manifest and permits only relative safe file paths', () => {
  expect(parseSkillsManifest(manifest()).skills[0]!.name).toBe('beam-cli');
  for (const path of ['SKILL.md', 'assets/html/main.ts', 'references/clocks.md'])
    expect(safeSkillPath(path)).toBe(true);
  for (const path of [
    '',
    '../file',
    '/file',
    'a//b',
    'a\\b',
    '.hidden',
    'a/../b',
    '__proto__/file',
    'constructor/file',
    'prototype/file',
    'x'.repeat(241),
  ])
    expect(safeSkillPath(path)).toBe(false);
});
it.each([
  null,
  {},
  { ...manifest(), schemaVersion: 2 },
  { ...manifest(), version: 'latest' },
  { ...manifest(), skills: [] },
  { ...manifest(), skills: Array(33).fill(manifest().skills[0]) },
  { ...manifest(), skills: [null] },
  { ...manifest(), skills: [manifest().skills[0], manifest().skills[0]] },
  { ...manifest(), skills: [{ ...manifest().skills[0], name: '../beam-cli' }] },
  { ...manifest(), skills: [{ ...manifest().skills[0], description: '' }] },
  { ...manifest(), skills: [{ ...manifest().skills[0], description: 'x'.repeat(1025) }] },
  { ...manifest(), skills: [{ ...manifest().skills[0], files: [] }] },
  { ...manifest(), skills: [{ ...manifest().skills[0], files: {} }] },
  { ...manifest(), skills: [{ ...manifest().skills[0], files: { 'SKILL.md': 'bad' } }] },
  {
    ...manifest(),
    skills: [
      { ...manifest().skills[0], files: { 'SKILL.md': hashSkillFile(content), '../escape': hashSkillFile(content) } },
    ],
  },
])('rejects invalid or unsafe manifests: %j', (value) => expect(() => parseSkillsManifest(value)).toThrow());

it('bounds the total manifest file count', () => {
  const value = manifest();
  for (let i = 0; i < 128; i++) value.skills[0]!.files[`file-${i}.md` as 'SKILL.md'] = hashSkillFile('test');
  expect(() => parseSkillsManifest(value)).toThrow('128 files');
});

it('pins all remote files to the resolved commit and installs real received bytes', async () => {
  const root = await temporary();
  const fetch = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(new Response(JSON.stringify({ sha })))
    .mockResolvedValueOnce(new Response(JSON.stringify(manifest())))
    .mockResolvedValueOnce(new Response(content));
  expect(await runSkillsCommand(['install', '--dir', join(root, 'skills'), '--ref', 'release/v1'])).toMatchObject({
    current: true,
    revision: sha,
  });
  expect(fetch.mock.calls.map(([url]) => url)).toEqual([
    'https://api.github.com/repos/BeamRecorder/Beam/commits/release%2Fv1',
    `https://raw.githubusercontent.com/BeamRecorder/Beam/${sha}/.skills/Beam-cli/manifest.json`,
    `https://raw.githubusercontent.com/BeamRecorder/Beam/${sha}/.skills/Beam-cli/beam-cli/SKILL.md`,
  ]);
  expect(fetch).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({ redirect: 'error', signal: expect.any(AbortSignal) }),
  );
});

it('checks remote freshness using only commit and manifest requests', async () => {
  const root = await temporary();
  const fetch = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(new Response(JSON.stringify({ sha })))
    .mockResolvedValueOnce(new Response(JSON.stringify(manifest())));
  expect(await runSkillsCommand(['check', '--dir', join(root, 'skills')])).toMatchObject({
    current: false,
    skills: [{ status: 'missing' }],
  });
  expect(fetch).toHaveBeenCalledTimes(2);
});

it.each(['', 'bad ref', '\u0000', 'x'.repeat(161)])(
  'rejects invalid refs before requesting the network: %j',
  async (ref) => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    await expect(loadSkillsSource(ref)).rejects.toThrow('Invalid skills --ref');
    expect(fetch).not.toHaveBeenCalled();
  },
);
it.each([{ sha: 'master' }, { sha: 42 }, {}])('rejects a malformed repository revision: %j', async (commit) => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify(commit)));
  await expect(loadSkillsSource('master')).rejects.toThrow('revision');
});
it.each([403, 404, 429, 500])('reports remote HTTP %s without calling it stale', async (status) => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('error', { status }));
  await expect(loadSkillsSource('master')).rejects.toThrow(`HTTP ${status}`);
});
it('propagates network failure without a write or stale report', async () => {
  vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('offline'));
  await expect(loadSkillsSource('master')).rejects.toThrow('offline');
});
it.each(['header', 'stream', 'empty'])('bounds downloads and rejects missing bodies: %s', async (kind) => {
  const response =
    kind === 'header'
      ? new Response('', { headers: { 'content-length': '9999999' } })
      : kind === 'stream'
        ? new Response('x'.repeat(256 * 1024 + 1))
        : new Response(null);
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response);
  await expect(loadSkillsSource('master')).rejects.toThrow(kind === 'empty' ? 'Empty' : 'too large');
});
it('rejects unsafe remote paths without making another request', async () => {
  const fetch = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(new Response(JSON.stringify({ sha })))
    .mockResolvedValueOnce(new Response(JSON.stringify(manifest())));
  const source = await loadSkillsSource('master');
  expect(() => source.read('../escape')).toThrow('remote skill path');
  expect(fetch).toHaveBeenCalledTimes(2);
});
it('reads a local source without network and rejects unsafe, missing and oversized files', async () => {
  const root = await temporary();
  await writeFile(join(root, 'manifest.json'), JSON.stringify(manifest()));
  await writeFile(join(root, 'big.md'), Buffer.alloc(1024 * 1024 + 1));
  await mkdir(join(root, 'folder'));
  const fetch = vi.spyOn(globalThis, 'fetch');
  const source = await loadSkillsSource('ignored', root);
  expect(source.revision).toBe('local');
  await expect(source.read('../escape')).rejects.toThrow('local skill path');
  await expect(source.read('big.md')).rejects.toThrow('oversized');
  await expect(source.read('folder')).rejects.toThrow('Invalid');
  await expect(source.read('missing.md')).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
});
it('rejects symlink ancestors and propagates filesystem boundary errors', async () => {
  const root = await temporary();
  await mkdir(join(root, 'real'));
  await symlink(join(root, 'real'), join(root, 'linked'), 'junction');
  await expect(assertSkillPathSafe(join(root, 'linked/descendant'))).rejects.toThrow('symlink');
  await writeFile(join(root, 'file'), 'not a directory');
  await expect(assertSkillPathSafe(join(root, 'file/child'))).rejects.toThrow();
  await expect(assertSkillPathSafe(join(root, 'absent/child'))).resolves.toBeUndefined();
});
