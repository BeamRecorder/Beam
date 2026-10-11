import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import type { SkillsManifest, SkillsSource } from './skills-types';

const repository = 'BeamRecorder/Beam';
const root = '.skills/Beam-cli';
export const hashSkillFile = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');

export function safeSkillPath(path: string) {
  return (
    path.length <= 240 &&
    path.split('/').every((part) => /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(part) && part !== '..') &&
    !path.split('/').some((part) => ['__proto__', 'constructor', 'prototype'].includes(part))
  );
}

export function parseSkillsManifest(value: unknown): SkillsManifest {
  const manifest = value as SkillsManifest | null;
  if (
    !manifest ||
    manifest.schemaVersion !== 1 ||
    typeof manifest.version !== 'string' ||
    !/^\d+\.\d+\.\d+$/.test(manifest.version) ||
    !Array.isArray(manifest.skills) ||
    !manifest.skills.length ||
    manifest.skills.length > 32
  )
    throw new Error('Invalid Beam skills manifest.');
  const names = new Set<string>();
  let count = 0;
  for (const skill of manifest.skills) {
    if (
      !skill ||
      typeof skill.name !== 'string' ||
      !/^beam-[a-z0-9-]{1,58}$/.test(skill.name) ||
      names.has(skill.name) ||
      typeof skill.description !== 'string' ||
      !skill.description.length ||
      skill.description.length > 1024 ||
      !skill.files ||
      typeof skill.files !== 'object' ||
      Array.isArray(skill.files) ||
      !Object.hasOwn(skill.files, 'SKILL.md')
    )
      throw new Error('Invalid or duplicate Beam skill.');
    names.add(skill.name);
    for (const [path, hash] of Object.entries(skill.files)) {
      if (!safeSkillPath(path) || typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash))
        throw new Error('Invalid Beam skill file path or checksum.');
      if (++count > 128) throw new Error('Beam skill pack exceeds 128 files.');
    }
  }
  return manifest;
}

/** Reject symlink components before local reads or destination writes. */
export async function assertSkillPathSafe(path: string) {
  const absolute = resolve(path);
  const parts = absolute.split(sep);
  let current = parts.shift()! + sep;
  for (const part of parts) {
    current = resolve(current, part);
    try {
      if ((await lstat(current)).isSymbolicLink()) throw new Error(`Skill path contains a symlink: ${current}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
  }
}

async function download(url: string, limit: number) {
  const response = await fetch(url, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Beam-CLI-skills' },
    signal: AbortSignal.timeout(15000),
    redirect: 'error',
  });
  if (!response.ok)
    throw new Error(`Cannot fetch Beam skills (HTTP ${response.status}). Check connectivity, GitHub access and --ref.`);
  if (Number(response.headers.get('content-length')) > limit) throw new Error('Beam skills response is too large.');
  if (!response.body) throw new Error('Empty Beam skills response.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error('Beam skills response is too large.');
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}

export async function loadSkillsSource(ref: string, local?: string): Promise<SkillsSource> {
  if (local) {
    const directory = resolve(local);
    const read = async (path: string) => {
      if (!safeSkillPath(path)) throw new Error('Invalid local skill path.');
      const file = resolve(directory, path);
      await assertSkillPathSafe(file);
      const stat = await lstat(file);
      if (!stat.isFile() || stat.size > 1024 * 1024) throw new Error('Invalid or oversized skill file.');
      return readFile(file);
    };
    return {
      manifest: parseSkillsManifest(JSON.parse((await read('manifest.json')).toString())),
      revision: 'local',
      read,
    };
  }
  if (!ref || ref.length > 160 || /\s/.test(ref) || [...ref].some((character) => character.charCodeAt(0) < 32))
    throw new Error('Invalid skills --ref.');
  const commit = JSON.parse(
    (
      await download(`https://api.github.com/repos/${repository}/commits/${encodeURIComponent(ref)}`, 256 * 1024)
    ).toString(),
  ) as { sha?: unknown };
  if (typeof commit.sha !== 'string' || !/^[a-f0-9]{40}$/.test(commit.sha))
    throw new Error('Invalid Beam repository revision.');
  const base = `https://raw.githubusercontent.com/${repository}/${commit.sha}/${root}`;
  const read = (path: string) => {
    if (!safeSkillPath(path)) throw new Error('Invalid remote skill path.');
    return download(`${base}/${path}`, 1024 * 1024);
  };
  const manifest = parseSkillsManifest(JSON.parse((await download(`${base}/manifest.json`, 256 * 1024)).toString()));
  return { manifest, revision: commit.sha, read };
}
