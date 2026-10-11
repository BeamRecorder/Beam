// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runSkillsCommand, parseSkillsOptions } from './skills';
import { hashSkillFile } from './skills-source';
import { runCliCommand } from './cli-runner';
import type { SkillsManifest } from './skills-types';

const directories: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  process.exitCode = 0;
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'beam-skills-'));
  directories.push(root);
  const source = join(root, 'source'),
    destination = join(root, 'installed');
  await mkdir(join(source, 'beam-cli'), { recursive: true });
  await mkdir(join(source, 'beam-animation'), { recursive: true });
  await writeFile(join(source, 'beam-cli/SKILL.md'), 'CLI version one');
  await writeFile(join(source, 'beam-animation/SKILL.md'), 'Animation version one');
  const manifest: SkillsManifest = {
    schemaVersion: 1,
    version: '1.0.0',
    skills: ['beam-cli', 'beam-animation'].map((name) => ({
      name,
      description: name,
      files: { 'SKILL.md': hashSkillFile(name === 'beam-cli' ? 'CLI version one' : 'Animation version one') },
    })),
  };
  const save = () => writeFile(join(source, 'manifest.json'), JSON.stringify(manifest));
  await save();
  const run = (action: string, ...extra: string[]) =>
    runSkillsCommand([action, '--source', source, '--dir', destination, ...extra]);
  return { root, source, destination, manifest, save, run };
}

describe('skills destination and argument selection', () => {
  it('uses shared project skills by default and home only when requested', () => {
    expect(parseSkillsOptions(['install'], '/project', '/person').directory).toBe('/project/.agents/skills');
    expect(parseSkillsOptions(['install', '--global'], '/project', '/person').directory).toBe('/person/.agents/skills');
    expect(parseSkillsOptions(['update', '--dir', 'custom'], '/project', '/person').directory).toBe('/project/custom');
  });
  it.each(['agents', 'claude', 'cursor', 'gemini'])('selects %s project and global directories', (agent) => {
    expect(parseSkillsOptions(['install', '--agent', agent], '/project', '/person').directory).toBe(
      `/project/.${agent}/skills`,
    );
    expect(parseSkillsOptions(['check', '--agent', agent, '--global'], '/project', '/person').directory).toBe(
      `/person/.${agent}/skills`,
    );
  });
  it('retains selected names, ref and explicit replacement intent', () => {
    expect(parseSkillsOptions(['update', 'beam-animation', '--ref', 'release/v1', '--force'])).toMatchObject({
      action: 'update',
      names: ['beam-animation'],
      ref: 'release/v1',
      force: true,
    });
    expect(parseSkillsOptions(['install', '--source', './pack'], '/project')).toMatchObject({
      source: '/project/pack',
    });
  });
  it.each([
    ['invalid'],
    ['install', '--unknown'],
    ['install', '--agent', 'other'],
    ['install', '--dir'],
    ['install', '--ref', '--global'],
    ['install', '--global', '--global'],
    ['install', '--dir', 'x', '--agent', 'claude'],
    ['install', '--dir', 'x', '--global'],
    ['install', '--source', 'x', '--ref', 'master'],
    ['check', '--force'],
    ['install', '../beam-cli'],
    ['install', 'beam-cli', 'beam-cli'],
  ])('rejects malformed options %j', (...args) => expect(() => parseSkillsOptions(args)).toThrow());
});

describe('managed skill installation lifecycle', () => {
  it('reports missing skills read-only, installs them and leaves current files unchanged', async () => {
    const f = await fixture();
    expect(await f.run('check')).toMatchObject({
      current: false,
      skills: [{ status: 'missing' }, { status: 'missing' }],
    });
    expect(process.exitCode).toBe(1);
    await expect(readdir(f.destination)).rejects.toThrow();
    process.exitCode = 0;
    expect(await f.run('install')).toMatchObject({
      current: true,
      changed: [{ name: 'beam-cli' }, { name: 'beam-animation' }],
    });
    expect(await readFile(join(f.destination, 'beam-cli/SKILL.md'), 'utf8')).toBe('CLI version one');
    expect(await f.run('check')).toMatchObject({ current: true });
    expect(await f.run('update')).toMatchObject({ changed: [] });
    expect(await readdir(f.destination)).toEqual(['beam-animation', 'beam-cli']);
  });
  it('updates stale content, removes retired managed files and retains unrelated skills', async () => {
    const f = await fixture();
    await writeFile(join(f.source, 'beam-cli/old.md'), 'retired');
    f.manifest.skills[0]!.files['old.md'] = hashSkillFile('retired');
    await f.save();
    await f.run('install');
    await mkdir(join(f.destination, 'user-skill'));
    await writeFile(join(f.destination, 'user-skill/notes.md'), 'keep me');
    await writeFile(join(f.source, 'beam-cli/SKILL.md'), 'CLI version two');
    f.manifest.skills[0]!.files = { 'SKILL.md': hashSkillFile('CLI version two') };
    f.manifest.version = '1.1.0';
    await f.save();
    expect(await f.run('check')).toMatchObject({ skills: [{ status: 'outdated' }, { status: 'outdated' }] });
    expect(await f.run('update')).toMatchObject({ current: true });
    expect(await readdir(join(f.destination, 'beam-cli'))).toEqual(['.beam-skill.json', 'SKILL.md']);
    expect(await readFile(join(f.destination, 'user-skill/notes.md'), 'utf8')).toBe('keep me');
  });
  it('protects modifications and preserves the whole old folder on explicit forced update', async () => {
    const f = await fixture();
    await f.run('install');
    await writeFile(join(f.destination, 'beam-cli/SKILL.md'), 'my custom instructions');
    await mkdir(join(f.destination, 'beam-cli/references'));
    await writeFile(join(f.destination, 'beam-cli/references/local.md'), 'custom reference');
    expect(await f.run('check')).toMatchObject({ skills: [{ status: 'modified' }, { status: 'current' }] });
    await expect(f.run('update')).rejects.toThrow('preserved');
    const result = await f.run('update', '--force');
    expect(result).toHaveProperty('changed');
    const backup = (result as { changed: { backup: string }[] }).changed[0]!.backup;
    expect(await readFile(join(backup, 'SKILL.md'), 'utf8')).toBe('my custom instructions');
    expect(await readFile(join(backup, 'references/local.md'), 'utf8')).toBe('custom reference');
    expect(await f.run('check')).toMatchObject({ current: true });
  });
  it.each(['missing-marker', 'malformed-marker', 'foreign-marker', 'file'])(
    'never overwrites unmanaged conflicts: %s',
    async (kind) => {
      const f = await fixture();
      await mkdir(f.destination);
      const target = join(f.destination, 'beam-cli');
      if (kind === 'file') await writeFile(target, 'unmanaged');
      else {
        await mkdir(target);
        if (kind === 'malformed-marker') await writeFile(join(target, '.beam-skill.json'), '{');
        if (kind === 'foreign-marker')
          await writeFile(join(target, '.beam-skill.json'), JSON.stringify({ repository: 'other', name: 'beam-cli' }));
      }
      expect(await f.run('check', 'beam-cli')).toMatchObject({ skills: [{ status: 'conflict' }] });
      await expect(f.run('install', '--force')).rejects.toThrow('preserved');
      await expect(readdir(join(f.destination, 'beam-animation'))).rejects.toThrow();
    },
  );
  it('supports a selected subset and rejects unknown skills before writes', async () => {
    const f = await fixture();
    expect(await f.run('install', 'beam-animation')).toMatchObject({ changed: [{ name: 'beam-animation' }] });
    expect(await readdir(f.destination)).toEqual(['beam-animation']);
    expect(await f.run('check', 'beam-animation')).toMatchObject({ current: true });
    await expect(f.run('install', 'beam-other')).rejects.toThrow('Unknown Beam skill');
  });
  it('validates all downloaded bytes before applying any pending update', async () => {
    const f = await fixture();
    await f.run('install');
    await writeFile(join(f.source, 'beam-cli/SKILL.md'), 'updated CLI');
    f.manifest.skills[0]!.files['SKILL.md'] = hashSkillFile('updated CLI');
    f.manifest.skills[1]!.files['SKILL.md'] = hashSkillFile('does not match');
    await f.save();
    await expect(f.run('update')).rejects.toThrow('checksum mismatch');
    expect(await readFile(join(f.destination, 'beam-cli/SKILL.md'), 'utf8')).toBe('CLI version one');
  });
  it('preserves a local edit made while an update is downloading', async () => {
    const f = await fixture();
    await f.run('install');
    const content = 'remote version two';
    f.manifest.skills = [f.manifest.skills[0]!];
    f.manifest.skills[0]!.files['SKILL.md'] = hashSkillFile(content);
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ sha: 'a'.repeat(40) })))
      .mockResolvedValueOnce(new Response(JSON.stringify(f.manifest)))
      .mockImplementationOnce(async () => {
        await writeFile(join(f.destination, 'beam-cli/SKILL.md'), 'edit during download');
        return new Response(content);
      });
    await expect(runSkillsCommand(['update', '--dir', f.destination])).rejects.toThrow('changed during download');
    expect(await readFile(join(f.destination, 'beam-cli/SKILL.md'), 'utf8')).toBe('edit during download');
  });
  it('rejects symlink destinations, source files and installed descendants', async () => {
    const f = await fixture();
    await mkdir(join(f.root, 'outside'));
    await symlink(join(f.root, 'outside'), f.destination, 'junction');
    await expect(f.run('install')).rejects.toThrow('symlink');
    await rm(f.destination);
    await rm(join(f.source, 'beam-cli/SKILL.md'));
    await symlink(join(f.source, 'beam-animation/SKILL.md'), join(f.source, 'beam-cli/SKILL.md'));
    await expect(f.run('install')).rejects.toThrow('symlink');
    await rm(join(f.source, 'beam-cli/SKILL.md'));
    await writeFile(join(f.source, 'beam-cli/SKILL.md'), 'CLI version one');
    await f.run('install');
    await symlink(join(f.root, 'outside'), join(f.destination, 'beam-cli/link'), 'junction');
    await expect(f.run('update', '--force')).rejects.toThrow('Unsafe');
  });
  it('treats locally added hidden files as modifications', async () => {
    const f = await fixture();
    await f.run('install');
    await writeFile(join(f.destination, 'beam-cli/.notes'), 'local note');
    expect(await f.run('check', 'beam-cli')).toMatchObject({ skills: [{ status: 'modified' }] });
  });
  it('installs and checks the complete maintained pack in an isolated directory', async () => {
    const f = await fixture();
    await cp(resolve('.skills/Beam-cli'), join(f.root, 'real-pack'), { recursive: true });
    const args = ['--source', join(f.root, 'real-pack'), '--dir', f.destination];
    const result = await runCliCommand(['skills', 'install', ...args]);
    expect(result).toMatchObject({ current: true, changed: expect.any(Array) });
    expect((await readdir(f.destination)).filter((name) => name.startsWith('beam-'))).toHaveLength(10);
    expect(await runCliCommand(['skills', 'check', ...args])).toMatchObject({ current: true });
    expect(await readFile(join(f.destination, 'beam-composition/assets/html/main.ts'), 'utf8')).toContain(
      'beamComposition',
    );
    expect(await runCliCommand(['docs', 'skills'])).toMatchObject({
      topic: 'skills',
      content: expect.stringContaining('Beam agent skills'),
    });
  });
  it.each([[], ['--help'], ['-h'], ['install', '--help'], ['check', '--help']])(
    'provides help without network or file mutation for %j',
    async (...args) => {
      const fetch = vi.spyOn(globalThis, 'fetch');
      expect(await runSkillsCommand(args)).toHaveProperty('usage');
      expect(fetch).not.toHaveBeenCalled();
    },
  );
});
