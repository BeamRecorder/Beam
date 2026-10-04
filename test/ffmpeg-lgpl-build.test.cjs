const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const yaml = require('js-yaml');

test(
  'rejects a corrupted download before extracting or compiling FFmpeg',
  { skip: process.platform !== 'linux' },
  (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-lgpl-download-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const bin = path.join(root, 'bin');
    fs.mkdirSync(bin);
    fs.writeFileSync(
      path.join(bin, 'curl'),
      '#!/usr/bin/env bash\nwhile [[ $# -gt 0 ]]; do\n  if [[ "$1" == "-o" ]]; then printf corrupted > "$2"; exit 0; fi\n  shift\ndone\nexit 1\n',
      { mode: 0o755 },
    );
    const result = spawnSync('bash', ['scripts/native/ffmpeg-lgpl.sh'], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, BEAM_FFMPEG_LGPL_PREFIX: path.join(root, 'prefix') },
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /checksum|FAILED/);
    assert.deepEqual(fs.readdirSync(path.join(root, 'prefix')), ['ffmpeg-8.1.3.tar.xz']);
  },
);

test('CI and releases use the shared LGPL recipe and keep the dependency outside resource packaging', () => {
  for (const workflow of ['ci.yml', 'release.yml']) {
    const document = yaml.load(fs.readFileSync(path.join('.github/workflows', workflow), 'utf8'));
    const steps = document.jobs['package-linux'].steps;
    const buildIndex = steps.findIndex((step) => step.run?.includes('bun run build:ffmpeg-lgpl'));
    const helperIndex = steps.findIndex((step) => step.run?.includes('bun run build:ffmpeg-export'));
    assert.ok(buildIndex >= 0 && helperIndex > buildIndex);
    assert.match(steps[buildIndex].run, /PKG_CONFIG_PATH=.*ffmpeg-lgpl\/lib\/pkgconfig/);
    assert.match(steps[buildIndex].run, /LD_LIBRARY_PATH=.*ffmpeg-lgpl\/lib/);
    assert.match(steps[helperIndex].run, /ffmpeg-export-license\.test\.cjs/);
    const install = steps.find((step) => step.run?.includes('apt-get install')).run;
    assert.ok(!/(?:^|\s)(?:ffmpeg|libavcodec-dev|libavfilter-dev)(?:\s|$)/.test(install));
  }
  const recipe = fs.readFileSync('scripts/native/ffmpeg-lgpl.sh', 'utf8');
  for (const flag of [
    '--disable-gpl',
    '--disable-nonfree',
    '--disable-static',
    '--enable-shared',
    '--disable-autodetect',
  ])
    assert.ok(recipe.includes(flag));
});

test('installed CLI documentation includes the external FFmpeg notice, LGPL text and build recipe', () => {
  const bundler = fs.readFileSync('scripts/build-cli.mjs', 'utf8');
  for (const file of [
    'docs/third-party/ffmpeg.md',
    'docs/third-party/FFmpeg-LGPL-2.1.txt',
    'docs/dev/ffmpeg-gpu-export.md',
    'scripts/native/ffmpeg-lgpl.sh',
  ]) {
    assert.ok(bundler.includes(`'${file}'`));
    assert.ok(fs.statSync(file).isFile());
  }
  assert.match(fs.readFileSync('docs/third-party/FFmpeg-LGPL-2.1.txt', 'utf8'), /GNU LESSER GENERAL PUBLIC LICENSE/);
});
