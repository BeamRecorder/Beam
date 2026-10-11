import { homedir } from 'node:os';
import { resolve, join } from 'node:path';
import { loadSkillsSource, hashSkillFile, assertSkillPathSafe } from './skills-source';
import { inspectSkill, writeSkill } from './skills-store';
import type { SkillsOptions } from './skills-types';

export const skillsHelp = `Install Beam agent skills before asking an AI agent to create or edit with Beam.
beam-cli skills install [NAME...] [--agent agents|claude|cursor|gemini] [--global]
beam-cli skills check [NAME...] [--agent AGENT] [--global]
beam-cli skills update [NAME...] [--agent AGENT] [--global] [--force]

Default: all skills, project-local .agents/skills (shared Agent Skills discovery).
--agent selects .agents, .claude, .cursor or .gemini; --global uses your home directory.
--dir PATH selects an explicit skills directory instead of --agent/--global.
--ref REF pins a Beam branch, tag or commit (default: master).
--source PATH reads a local .skills/Beam-cli directory for development/offline use.
check is read-only and exits 1 for missing, outdated, modified or conflicting skills.
install/update preserve local edits; --force backs up modified managed skills before replacing them.
Source: https://github.com/BeamRecorder/Beam/tree/master/.skills/Beam-cli
Reload skills or start a new agent session after installation.`;

export function parseSkillsOptions(args: string[], cwd = process.cwd(), home = homedir()): SkillsOptions {
  const action = args[0];
  if (action !== 'install' && action !== 'check' && action !== 'update') throw new Error(skillsHelp);
  const options: SkillsOptions = { action, names: [], directory: '', ref: 'master', force: false };
  let agent = 'agents',
    global = false,
    explicitAgent = false;
  const seen = new Set<string>();
  for (let i = 1; i < args.length; i++) {
    const argument = args[i]!;
    if (!argument.startsWith('-')) {
      if (!/^beam-[a-z0-9-]+$/.test(argument) || options.names.includes(argument))
        throw new Error(`Invalid or duplicate skill: ${argument}`);
      options.names.push(argument);
      continue;
    }
    if (seen.has(argument)) throw new Error(`Duplicate skills option: ${argument}`);
    seen.add(argument);
    if (argument === '--force') options.force = true;
    else if (argument === '--global') global = true;
    else if (['--dir', '--ref', '--source', '--agent'].includes(argument)) {
      const value = args[++i];
      if (!value || value.startsWith('-')) throw new Error(`Missing value for ${argument}.`);
      if (argument === '--dir') options.directory = resolve(cwd, value);
      else if (argument === '--ref') options.ref = value;
      else if (argument === '--source') options.source = resolve(cwd, value);
      else {
        agent = value;
        explicitAgent = true;
      }
    } else throw new Error(`Unknown skills option: ${argument}`);
  }
  if (!['agents', 'claude', 'cursor', 'gemini'].includes(agent))
    throw new Error('Unknown skills agent. Choose agents, claude, cursor or gemini.');
  if (options.directory && (explicitAgent || global))
    throw new Error('--dir cannot be combined with --agent or --global.');
  if (options.source && seen.has('--ref')) throw new Error('--source cannot be combined with --ref.');
  if (options.force && action === 'check') throw new Error('check is read-only; --force is not supported.');
  options.directory ||= join(global ? home : cwd, '.' + agent, 'skills');
  return options;
}

export async function runSkillsCommand(args: string[]) {
  if (!args.length || (args.length <= 2 && ['--help', '-h'].includes(args.at(-1)!))) return { usage: skillsHelp };
  const options = parseSkillsOptions(args);
  await assertSkillPathSafe(options.directory);
  const source = await loadSkillsSource(options.ref, options.source);
  const selected = options.names.length
    ? options.names.map((name) => {
        const skill = source.manifest.skills.find((item) => item.name === name);
        if (!skill)
          throw new Error(
            `Unknown Beam skill: ${name}. Available: ${source.manifest.skills.map((item) => item.name).join(', ')}`,
          );
        return skill;
      })
    : source.manifest.skills;
  const skills = await Promise.all(
    selected.map((skill) => inspectSkill(options.directory, skill, source.manifest.version)),
  );
  const current = skills.every((skill) => skill.status === 'current');
  const report = {
    action: options.action,
    version: source.manifest.version,
    revision: source.revision,
    directory: options.directory,
    current,
    skills,
  };
  if (options.action === 'check') {
    if (!current) process.exitCode = 1;
    return report;
  }
  const conflicts = skills.filter(
    (skill) => skill.status === 'conflict' || (skill.status === 'modified' && !options.force),
  );
  if (conflicts.length)
    throw new Error(
      `Skills preserved: ${conflicts.map((skill) => `${skill.name} (${skill.status})`).join(', ')}. Move unmanaged folders aside; use --force only to back up and replace modified Beam-managed skills.`,
    );
  // Validate every download before changing any destination; failures leave the installed pack intact.
  const pending = [];
  let total = 0;
  for (const [index, skill] of selected.entries()) {
    if (skills[index]!.status === 'current') continue;
    const files = new Map<string, Buffer>();
    const entries = Object.entries(skill.files);
    for (let i = 0; i < entries.length; i += 4) {
      const fetched = await Promise.all(
        entries.slice(i, i + 4).map(async ([path, expected]) => {
          const data = await source.read(`${skill.name}/${path}`);
          if (hashSkillFile(data) !== expected) throw new Error(`Beam skill checksum mismatch: ${skill.name}/${path}`);
          total += data.byteLength;
          if (total > 8 * 1024 * 1024) throw new Error('Beam skill pack exceeds 8 MiB.');
          return [path, data] as const;
        }),
      );
      for (const [path, data] of fetched) files.set(path, data);
    }
    pending.push({ skill, files, preserve: skills[index]!.status === 'modified' });
  }
  const changed = [];
  for (const { skill, files, preserve } of pending) {
    const fresh = await inspectSkill(options.directory, skill, source.manifest.version);
    if (fresh.status === 'conflict' || (fresh.status === 'modified' && !options.force))
      throw new Error(
        `Skill changed during download and was preserved: ${skill.name}. Run skills check before retrying.`,
      );
    const backup = await writeSkill(
      options.directory,
      {
        schemaVersion: 1,
        repository: 'BeamRecorder/Beam',
        name: skill.name,
        version: source.manifest.version,
        revision: source.revision,
        files: skill.files,
      },
      files,
      preserve || fresh.status === 'modified',
    );
    changed.push({ name: skill.name, ...(backup ? { backup } : {}) });
  }
  return {
    ...report,
    current: true,
    skills: skills.map((skill) => ({ name: skill.name, status: 'current' })),
    changed,
    next: 'Reload skills or start a new agent session. Ask your agent to use the beam-cli skill.',
  };
}
