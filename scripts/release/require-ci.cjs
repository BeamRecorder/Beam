const { execFileSync } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');

const gh = (args) => execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });

async function requireSuccessfulCi({ repository, sha, execute = gh, pause = delay, attempts = 20 }) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository ?? '') || !/^[a-f0-9]{40}$/.test(sha ?? ''))
    throw new Error('A repository and exact commit SHA are required for the release CI gate.');
  let run;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const runs = JSON.parse(
      execute([
        'run',
        'list',
        '--repo',
        repository,
        '--workflow',
        'ci.yml',
        '--commit',
        sha,
        '--event',
        'push',
        '--limit',
        '10',
        '--json',
        'databaseId,headSha,status,conclusion',
      ]),
    );
    run = runs.find((candidate) => candidate.headSha === sha);
    if (run) break;
    if (attempt + 1 < attempts) await pause(15000);
  }
  if (!run) throw new Error(`No CI run found for release commit ${sha}.`);
  if (run.status !== 'completed')
    execute(['run', 'watch', String(run.databaseId), '--repo', repository, '--interval', '20', '--exit-status']);
  const result = JSON.parse(
    execute(['run', 'view', String(run.databaseId), '--repo', repository, '--json', 'headSha,status,conclusion']),
  );
  if (result.headSha !== sha || result.status !== 'completed' || result.conclusion !== 'success')
    throw new Error(`CI must succeed for release commit ${sha}; received ${result.status}/${result.conclusion}.`);
  return run.databaseId;
}

if (require.main === module)
  requireSuccessfulCi({ repository: process.env.GITHUB_REPOSITORY, sha: process.env.GITHUB_SHA })
    .then((id) => console.log(`CI run ${id} passed for ${process.env.GITHUB_SHA}.`))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });

module.exports = { requireSuccessfulCi };
