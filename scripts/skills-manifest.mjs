import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const root = resolve(import.meta.dirname, '../.skills/Beam-cli');
const path = join(root, 'manifest.json');
const args = process.argv.slice(2);
if (args.some((arg) => arg !== '--check')) throw new Error('Usage: node scripts/skills-manifest.mjs [--check]');
let version = '1.0.0';
try {
  version = JSON.parse(await readFile(path, 'utf8')).version;
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Invalid skill pack version.');
const skills = [];
let count = 0,
  size = 0;
for (const entry of (await readdir(root, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
  if (!entry.isDirectory()) continue;
  if (!/^beam-[a-z0-9-]+$/.test(entry.name)) throw new Error(`Invalid skill directory: ${entry.name}`);
  const files = {};
  async function visit(directory, prefix = '') {
    for (const child of (await readdir(directory, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(child.name)) throw new Error(`Invalid skill file: ${child.name}`);
      const relative = prefix + child.name;
      if (child.isDirectory()) await visit(join(directory, child.name), relative + '/');
      else {
        if (!child.isFile()) throw new Error('Skill source cannot contain symlinks or special files.');
        const data = await readFile(join(directory, child.name));
        size += data.length;
        if (++count > 128 || data.length > 1024 * 1024 || size > 8 * 1024 * 1024)
          throw new Error('Skill pack exceeds installer bounds.');
        files[relative] = createHash('sha256').update(data).digest('hex');
      }
    }
  }
  await visit(join(root, entry.name));
  const skill = await readFile(join(root, entry.name, 'SKILL.md'), 'utf8');
  const name = skill.match(/^name: (.+)$/m)?.[1];
  const description = skill.match(/^description: (.+)$/m)?.[1];
  if (name !== entry.name || !description || description.length > 1024)
    throw new Error(`Invalid frontmatter: ${entry.name}`);
  skills.push({ name, description, files });
}
if (!skills.length || skills.length > 32) throw new Error('Invalid number of Beam skills.');
const result = JSON.stringify({ schemaVersion: 1, version, skills }, null, 2) + '\n';
if (args.includes('--check')) {
  if ((await readFile(path, 'utf8')) !== result)
    throw new Error('Beam skill manifest is stale. Run node scripts/skills-manifest.mjs.');
} else await writeFile(path, result);
process.stdout.write(`Beam skills manifest: ${skills.length} skills, ${count} files, ${size} bytes.\n`);
