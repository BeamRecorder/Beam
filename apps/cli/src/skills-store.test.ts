// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hashSkillFile } from './skills-source';
import { inspectSkill, writeSkill } from './skills-store';
import type { InstalledSkill } from './skills-types';
import type * as PromisesModule from 'node:fs/promises';

const faults = vi.hoisted(() => ({ publish: false, backup: false, stage: false }));
vi.mock('node:fs/promises', async (importOriginal) => {
  const fs = await importOriginal<typeof PromisesModule>();
  return {
    ...fs,
    rename: async (...args: Parameters<typeof fs.rename>) => {
      if (
        (faults.publish && String(args[0]).includes('.beam-stage-')) ||
        (faults.backup && String(args[1]).includes('.beam-skills-backups'))
      )
        throw Object.assign(new Error('simulated rename failure'), { code: 'EIO' });
      return fs.rename(...args);
    },
    writeFile: async (...args: Parameters<typeof fs.writeFile>) => {
      if (faults.stage && String(args[0]).includes('.beam-stage-')) throw new Error('simulated stage failure');
      return fs.writeFile(...args);
    },
  };
});

const directories: string[] = [];
afterEach(async () => {
  faults.publish = false;
  faults.backup = false;
  faults.stage = false;
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'beam-skills-store-'));
  directories.push(root);
  const directory = join(root, 'skills');
  const installed: InstalledSkill = {
    schemaVersion: 1,
    repository: 'BeamRecorder/Beam',
    name: 'beam-cli',
    version: '1.0.0',
    revision: 'local',
    files: { 'SKILL.md': hashSkillFile('original') },
  };
  await writeSkill(directory, installed, new Map([['SKILL.md', Buffer.from('original')]]), false);
  return { root, directory, installed };
}

it.each(['publish', 'backup', 'stage'] as const)(
  'preserves the previous installed directory and removes staging after a %s failure',
  async (failure) => {
    const f = await fixture();
    faults[failure] = true;
    await expect(
      writeSkill(f.directory, f.installed, new Map([['SKILL.md', Buffer.from('new')]]), false),
    ).rejects.toThrow('simulated');
    expect(await readFile(join(f.directory, 'beam-cli/SKILL.md'), 'utf8')).toBe('original');
    expect(await readdir(f.directory)).toEqual(['beam-cli']);
  },
);
it('reports oversized installed metadata as a protected conflict', async () => {
  const f = await fixture();
  await writeFile(join(f.directory, 'beam-cli/.beam-skill.json'), ' '.repeat(64 * 1024 + 1));
  expect(
    await inspectSkill(f.directory, { name: 'beam-cli', description: 'CLI', files: f.installed.files }, '1.0.0'),
  ).toMatchObject({ status: 'conflict' });
});
it('refuses to traverse oversized installed files', async () => {
  const f = await fixture();
  await writeFile(join(f.directory, 'beam-cli/large.md'), Buffer.alloc(1024 * 1024 + 1));
  await expect(
    inspectSkill(f.directory, { name: 'beam-cli', description: 'CLI', files: f.installed.files }, '1.0.0'),
  ).rejects.toThrow('Oversized');
});
