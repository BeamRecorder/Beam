import { mkdtemp, mkdir, readFile, readdir, rename, rm, lstat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { assertSkillPathSafe, hashSkillFile, parseSkillsManifest } from './skills-source';
import type { BeamSkill, InstalledSkill, SkillInspection } from './skills-types';

const marker = '.beam-skill.json';

export async function inspectSkill(directory: string, skill: BeamSkill, version: string): Promise<SkillInspection> {
  const target = join(directory, skill.name);
  await assertSkillPathSafe(target);
  let installed: InstalledSkill;
  try {
    const stat = await lstat(target);
    if (!stat.isDirectory()) return { name: skill.name, status: 'conflict' };
    await assertSkillPathSafe(join(target, marker));
    if ((await lstat(join(target, marker))).size > 64 * 1024) throw new Error('Oversized installed skill metadata.');
    installed = JSON.parse(await readFile(join(target, marker), 'utf8')) as InstalledSkill;
    if (
      installed.repository !== 'BeamRecorder/Beam' ||
      installed.name !== skill.name ||
      typeof installed.revision !== 'string'
    )
      throw new Error('Invalid installed skill metadata.');
    parseSkillsManifest({
      schemaVersion: installed.schemaVersion,
      version: installed.version,
      skills: [{ ...skill, files: installed.files }],
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      try {
        await lstat(target);
      } catch (missing) {
        if ((missing as NodeJS.ErrnoException).code === 'ENOENT') return { name: skill.name, status: 'missing' };
        throw missing;
      }
    }
    return { name: skill.name, status: 'conflict' };
  }
  const files: Record<string, string> = Object.create(null);
  let visited = 0;
  async function scan(folder: string, prefix = '') {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const relative = prefix + entry.name;
      if (!prefix && entry.name === marker) continue;
      if (++visited > 256 || entry.isSymbolicLink()) throw new Error('Unsafe or oversized installed skill tree.');
      if (entry.isDirectory()) await scan(join(folder, entry.name), relative + '/');
      else {
        if (
          !entry.isFile() ||
          (await lstat(join(folder, entry.name))).size > 1024 * 1024 ||
          Object.keys(files).length >= 128
        )
          throw new Error('Oversized installed skill.');
        files[relative] = hashSkillFile(await readFile(join(folder, entry.name)));
      }
    }
  }
  await scan(target);
  const matches = (expected: Record<string, string>) =>
    Object.keys(files).length === Object.keys(expected).length &&
    Object.entries(expected).every(([path, hash]) => files[path] === hash);
  const status = !matches(installed.files)
    ? 'modified'
    : matches(skill.files) && installed.version === version
      ? 'current'
      : 'outdated';
  return { name: skill.name, status, installedVersion: installed.version };
}

/** Complete each skill in staging, then swap directories. Forced replacements retain a backup. */
export async function writeSkill(
  directory: string,
  installed: InstalledSkill,
  files: Map<string, Buffer>,
  preserve: boolean,
) {
  await assertSkillPathSafe(directory);
  await mkdir(directory, { recursive: true });
  const target = join(directory, installed.name);
  await assertSkillPathSafe(target);
  const staging = await mkdtemp(join(directory, '.beam-stage-'));
  let backup: string | undefined;
  let moved = false;
  try {
    for (const [path, data] of files) {
      const destination = join(staging, path);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, data);
    }
    await writeFile(join(staging, marker), JSON.stringify(installed, null, 2) + '\n');
    try {
      await lstat(target);
      const backups = join(dirname(directory), '.beam-skills-backups');
      await assertSkillPathSafe(backups);
      await mkdir(backups, { recursive: true });
      backup = join(backups, installed.name + '-' + randomUUID());
      await rename(target, backup);
      moved = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    try {
      await rename(staging, target);
    } catch (error) {
      if (moved) await rename(backup!, target);
      throw error;
    }
    if (backup && !preserve) {
      await rm(backup, { recursive: true });
      backup = undefined;
    }
    return backup;
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
