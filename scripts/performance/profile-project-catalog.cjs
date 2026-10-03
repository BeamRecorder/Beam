// node scripts/performance/profile-project-catalog.cjs [--root /absolute/projects] [--count 1000] [--samples 5]
// Without --root, all generated projects live in a temporary directory removed after profiling.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createProjectStore } = require('../../apps/desktop/electron/projects/project-store.cjs');
const { createScreenshotStore } = require('../../apps/desktop/electron/screenshot/screenshot-store.cjs');
const { createProjectLibrary } = require('../../apps/desktop/electron/projects/project-library.cjs');
const { createProjectCatalogClient } = require('../../apps/desktop/electron/projects/project-catalog-client.cjs');

const option = (name, defaultValue) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? defaultValue : process.argv[index + 1];
};
const count = Number(option('--count', 1000));
const samples = Number(option('--samples', 5));
const requestedRoot = option('--root', null);
if (!Number.isInteger(count) || count < 1 || count > 10000 || !Number.isInteger(samples) || samples < 1 || samples > 20)
  throw new Error('Use --count 1..10000 and --samples 1..20.');
if (requestedRoot && !path.isAbsolute(requestedRoot)) throw new Error('--root must be an absolute project root.');
const root = requestedRoot || fs.mkdtempSync(path.join(os.tmpdir(), 'beam-catalog-profile-'));
const clients = new Set();
const client = () => {
  const created = createProjectCatalogClient(root);
  clients.add(created);
  return created;
};
const close = async (created) => {
  await created.destroy();
  clients.delete(created);
};
const round = (value) => Math.round(value * 10) / 10;
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function measure(operation) {
  let lastTick = performance.now(),
    maximumDelay = 0;
  const timer = setInterval(() => {
    const now = performance.now();
    maximumDelay = Math.max(maximumDelay, now - lastTick);
    lastTick = now;
  }, 2);
  try {
    await delay(10);
    maximumDelay = 0;
    const start = performance.now();
    const result = await operation();
    const ms = performance.now() - start;
    await delay(10);
    return { ms, maximumDelay, result };
  } finally {
    clearInterval(timer);
  }
}
async function profile(name, operation, repetitions = samples) {
  const runs = [];
  for (let index = 0; index < repetitions; index++) runs.push(await measure(operation));
  const result = runs.at(-1).result;
  console.log(
    JSON.stringify({
      phase: name,
      samples: runs.length,
      medianMs: round(median(runs.map((run) => run.ms))),
      minMs: round(Math.min(...runs.map((run) => run.ms))),
      maxMs: round(Math.max(...runs.map((run) => run.ms))),
      medianHeartbeatGapMs: round(median(runs.map((run) => run.maximumDelay))),
      count: Array.isArray(result) ? result.length : result.projects.length,
      total: Array.isArray(result) ? result.length : result.total,
      responseBytes: Buffer.byteLength(JSON.stringify(result)),
    }),
  );
  return result;
}
function seed() {
  const store = createProjectStore(root, { category: 'studio' });
  const template = store.create({ name: 'Template' });
  const base = JSON.parse(fs.readFileSync(path.join(store.directoryFor(template.id), 'project.json'), 'utf8'));
  store.delete(template.id);
  // A sizeable saved zoom timeline exercises parsing cost; no media decoders run in this benchmark.
  base.editor.zoom.elements = Array.from({ length: 512 }, (_, index) => ({
    id: randomUUID(),
    startMs: index * 1000,
    durationMs: 500,
    x: 0.5,
    y: 0.5,
    scale: 2,
    easing: 'ease-in-out',
  }));
  let metadataBytes = 0;
  for (let index = 0; index < count; index++) {
    const directory = path.join(root, 'studio', `project-benchmark-${index}`);
    fs.mkdirSync(directory, { recursive: true });
    const updated = new Date(Date.UTC(2025, 0, 1) + index * 1000).toISOString();
    const document = JSON.stringify({
      ...base,
      projectId: randomUUID(),
      name: `Benchmark project ${index}`,
      createdAtUtc: updated,
      updatedAtUtc: updated,
    });
    metadataBytes += Buffer.byteLength(document);
    fs.writeFileSync(path.join(directory, 'project.json'), document);
  }
  return metadataBytes;
}
async function main() {
  const metadataBytes = requestedRoot ? undefined : seed();
  console.log(
    JSON.stringify({
      dataset: requestedRoot ? 'existing-library' : 'synthetic-temporary-library',
      node: process.version,
      platform: process.platform,
      fixtureCount: requestedRoot ? undefined : count,
      metadataBytes,
    }),
  );
  const videos = createProjectStore(root, { category: 'studio', repairMetadata: false });
  const screenshots = createScreenshotStore(path.join(root, 'screenshot'));
  const library = createProjectLibrary(videos, screenshots);
  await profile('full-catalogue-after-manifest-read-fix', () => library.list());
  const active = client();
  const first = await profile(
    requestedRoot ? 'first-worker-existing-index' : 'first-index-build',
    () => active.page({ limit: 40 }),
    1,
  );
  await profile('warm-first-page-with-file-validation', () => active.page({ limit: 40 }));
  if (first.nextCursor) await profile('next-page', () => active.page({ limit: 40, cursor: first.nextCursor }));
  await close(active);
  await profile('fresh-worker-persisted-index', async () => {
    const next = client();
    try {
      return await next.page({ limit: 40 });
    } finally {
      await close(next);
    }
  });
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.all([...clients].map(close));
    if (!requestedRoot) fs.rmSync(root, { recursive: true, force: true });
  });
