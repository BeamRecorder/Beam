const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const json = require('../electron/storage/json-file.cjs');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-json-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, file: path.join(root, 'document.json') };
}

function instrument(asyncMode, overrides = {}) {
  const calls = [];
  const module = { ...fs, promises: { ...fs.promises } };
  for (const name of ['readFile', 'mkdir', 'writeFile', 'rename', 'unlink']) {
    const method = asyncMode ? name : `${name}Sync`;
    const target = asyncMode ? module.promises : module;
    const original = asyncMode ? fs.promises[name].bind(fs.promises) : fs[method].bind(fs);
    target[method] = (...args) => {
      calls.push({ name, args });
      return overrides[name] ? overrides[name](original, ...args) : original(...args);
    };
  }
  return { module, calls };
}

for (const asyncMode of [false, true]) {
  const suffix = asyncMode ? '' : 'Sync';
  const read = json[`readJson${suffix}`];
  const write = json[`writeJsonAtomic${suffix}`];
  const batch = json[`writeJsonBatch${suffix}`];
  const run = (name, fn) => test(`${asyncMode ? 'async' : 'sync'} JSON: ${name}`, fn);

  run('round-trips Unicode, null, arrays and nested documents', async (t) => {
    const { file } = fixture(t);
    for (const value of [null, ['日本語', false, 0], { title: 'Préférences', child: { enabled: true } }]) {
      await write(file, value);
      assert.deepEqual(await read(file), value);
    }
    if (process.platform !== 'win32') assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  });

  run('reports invalid JSON with its path, and preserves filesystem errors', async (t) => {
    const { root, file } = fixture(t);
    fs.writeFileSync(file, '{broken');
    await assert.rejects(
      async () => read(file),
      (error) => error instanceof SyntaxError && error.message.includes(file),
    );
    await assert.rejects(async () => read(path.join(root, 'missing.json')), { code: 'ENOENT' });
    const failed = instrument(asyncMode, {
      readFile: () => {
        throw Object.assign(new Error('denied'), { code: 'EACCES' });
      },
    });
    await assert.rejects(async () => read(file, { fsModule: failed.module }), { code: 'EACCES' });
  });

  run('creates parents, atomically replaces an existing document and preserves foreign temporaries', async (t) => {
    const { root } = fixture(t);
    const file = path.join(root, 'nested', 'document.json');
    await write(file, { old: true });
    fs.writeFileSync(`${file}.tmp`, 'foreign');
    const observed = instrument(asyncMode, {
      rename: (original, source, destination) => {
        assert.deepEqual(JSON.parse(fs.readFileSync(destination)), { old: true });
        assert.deepEqual(JSON.parse(fs.readFileSync(source)), { next: true });
        return original(source, destination);
      },
    });
    await write(file, { next: true }, { fsModule: observed.module, pretty: false });
    assert.equal(fs.readFileSync(file, 'utf8'), '{"next":true}\n');
    assert.equal(fs.readFileSync(`${file}.tmp`, 'utf8'), 'foreign');
    assert.deepEqual(fs.readdirSync(path.dirname(file)).sort(), ['document.json', 'document.json.tmp']);
  });

  run('deduplicates normalized destinations, uses the last value and stages all before publication', async (t) => {
    const { root, file } = fixture(t);
    const other = path.join(root, 'other.json');
    const observed = instrument(asyncMode);
    await batch(
      [
        { file, value: { ignored: true } },
        { file: other, value: [1, 2], pretty: false },
        { file: path.join(root, '.', 'document.json'), value: { final: true }, pretty: true },
      ],
      { fsModule: observed.module, pretty: false },
    );
    assert.deepEqual(await read(file), { final: true });
    assert.equal(fs.readFileSync(file, 'utf8'), '{\n  "final": true\n}\n');
    assert.equal(fs.readFileSync(other, 'utf8'), '[1,2]\n');
    const operations = observed.calls.map(({ name }) => name);
    assert.equal(operations.filter((name) => name === 'writeFile').length, 2);
    assert.equal(operations.filter((name) => name === 'mkdir').length, 1);
    assert.ok(operations.lastIndexOf('writeFile') < operations.indexOf('rename'));
  });

  run('empty batches perform no filesystem work', async (t) => {
    fixture(t);
    const observed = instrument(asyncMode);
    await batch([], { fsModule: observed.module });
    assert.deepEqual(observed.calls, []);
  });

  run('serializes the whole batch before writing, rejecting undefined, circular and BigInt values', async (t) => {
    const { file } = fixture(t);
    const circular = {};
    circular.self = circular;
    for (const value of [undefined, circular, 1n]) {
      const observed = instrument(asyncMode);
      await assert.rejects(
        async () =>
          batch(
            [
              { file, value: { valid: true } },
              { file: `${file}.other`, value },
            ],
            { fsModule: observed.module },
          ),
        TypeError,
      );
      assert.deepEqual(observed.calls, []);
      assert.equal(fs.existsSync(file), false);
    }
  });

  run('a staging failure preserves originals and removes even a partly written temporary', async (t) => {
    const { root, file } = fixture(t);
    fs.writeFileSync(file, '{"original":true}');
    const observed = instrument(asyncMode, {
      writeFile: asyncMode
        ? async (original, temporary, ...args) => {
            await original(temporary, ...args);
            throw new Error('disk full');
          }
        : (original, temporary, ...args) => {
            original(temporary, ...args);
            throw new Error('disk full');
          },
    });
    await assert.rejects(async () => write(file, { changed: true }, { fsModule: observed.module }), /disk full/);
    assert.deepEqual(await read(file), { original: true });
    assert.deepEqual(fs.readdirSync(root), ['document.json']);
    assert.equal(
      observed.calls.some(({ name }) => name === 'rename'),
      false,
    );
  });

  run('a parent-directory failure publishes nothing and cleans staged files', async (t) => {
    const { root, file } = fixture(t);
    const badParent = path.join(root, 'not-a-directory');
    fs.writeFileSync(badParent, 'blocker');
    await assert.rejects(async () =>
      batch([
        { file, value: true },
        { file: path.join(badParent, 'document.json'), value: false },
      ]),
    );
    assert.equal(fs.existsSync(file), false);
    assert.deepEqual(fs.readdirSync(root), ['not-a-directory']);
  });

  run('rename failures preserve unpublished originals; already published files stay complete', async (t) => {
    const { root, file } = fixture(t);
    const other = path.join(root, 'other.json');
    for (const failedIndex of [0, 1]) {
      await write(file, 0);
      await write(other, 0);
      let index = 0;
      const observed = instrument(asyncMode, {
        rename: (original, ...args) => {
          if (index++ === failedIndex) throw new Error('rename failed');
          return original(...args);
        },
      });
      await assert.rejects(
        async () =>
          batch(
            [
              { file, value: 1 },
              { file: other, value: 2 },
            ],
            { fsModule: observed.module },
          ),
        /rename failed/,
      );
      assert.equal(await read(file), failedIndex === 0 ? 0 : 1);
      assert.equal(await read(other), 0);
      assert.deepEqual(fs.readdirSync(root).sort(), ['document.json', 'other.json']);
    }
  });

  run('a temporary collision never deletes a file the writer does not own', async (t) => {
    const { root, file } = fixture(t);
    let collided;
    const observed = instrument(asyncMode, {
      writeFile: (_original, temporary) => {
        collided = temporary;
        fs.writeFileSync(temporary, 'foreign');
        throw Object.assign(new Error('exists'), { code: 'EEXIST' });
      },
    });
    await assert.rejects(async () => write(file, true, { fsModule: observed.module }), { code: 'EEXIST' });
    assert.equal(fs.readFileSync(collided, 'utf8'), 'foreign');
    assert.equal(fs.readdirSync(root).length, 1);
    assert.equal(
      observed.calls.some(({ name }) => name === 'unlink'),
      false,
    );
  });

  run('reports cleanup errors alongside the write failure and still cleans the remaining files', async (t) => {
    const { root, file } = fixture(t);
    let unlinkIndex = 0;
    const observed = instrument(asyncMode, {
      rename: () => {
        throw new Error('publish failed');
      },
      unlink: (original, ...args) => {
        if (unlinkIndex++ === 0) throw new Error('cleanup failed');
        return original(...args);
      },
    });
    await assert.rejects(
      async () =>
        batch(
          [
            { file, value: true },
            { file: `${file}.other`, value: false },
          ],
          { fsModule: observed.module },
        ),
      (error) => {
        assert.ok(error instanceof AggregateError);
        assert.deepEqual(
          error.errors.map(({ message }) => message),
          ['publish failed', 'cleanup failed'],
        );
        return true;
      },
    );
    assert.equal(fs.readdirSync(root).length, 1);
    assert.equal(unlinkIndex, 2);
  });
}

test('async JSON bounds staging concurrency and waits for in-flight failures before cleanup', async (t) => {
  const { root } = fixture(t);
  let active = 0;
  let peak = 0;
  let writes = 0;
  const observed = instrument(true, {
    writeFile: async (original, file, ...args) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setImmediate(resolve));
      try {
        await original(file, ...args);
        writes += 1;
      } finally {
        active -= 1;
      }
    },
  });
  await json.writeJsonBatch(
    Array.from({ length: 25 }, (_, i) => ({ file: path.join(root, `${i}.json`), value: i })),
    { fsModule: observed.module },
  );
  assert.equal(writes, 25);
  assert.ok(peak <= 4);
  assert.ok(peak > 1);
  const failure = instrument(true, {
    writeFile: async (original, file, ...args) => {
      active += 1;
      try {
        await original(file, ...args);
        await new Promise((resolve) => setImmediate(resolve));
        throw new Error('staging failed');
      } finally {
        active -= 1;
      }
    },
    unlink: (original, ...args) => {
      assert.equal(active, 0);
      return original(...args);
    },
  });
  await assert.rejects(
    json.writeJsonBatch(
      Array.from({ length: 4 }, (_, i) => ({ file: path.join(root, `${i}.json`), value: 'new' })),
      { fsModule: failure.module },
    ),
    AggregateError,
  );
  assert.equal(
    fs.readdirSync(root).some((name) => name.endsWith('.tmp')),
    false,
  );
  for (let i = 0; i < 4; i++) assert.equal(await json.readJson(path.join(root, `${i}.json`)), i);
});
