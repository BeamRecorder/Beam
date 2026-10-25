const assert = require('node:assert/strict');
const { test } = require('node:test');
const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { inspectSourceImports, checkRepositoryTypeImports } = require('../scripts/check-type-imports.mjs');

function repository(run) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'beam-import-rules-'));
  execFileSync('git', ['init', '--quiet', root]);
  const write = (file, value) => {
    const target = path.join(root, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, value);
  };
  try {
    run(root, write);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('permits top-level value and type declarations before application code', () => {
  assert.deepEqual(
    inspectSourceImports(
      'source.ts',
      "import { value } from './value';\nimport type { Settings } from './types';\nconst example:Settings=value;",
    ),
    [],
  );
});
test('rejects inline import types inside properties and function signatures', () => {
  const findings = inspectSourceImports(
    'source.ts',
    "interface Value { field: import('./types').Settings }\nfunction f(): import('./types').Result { throw 0; }",
  );
  assert.equal(findings.length, 2);
  assert.ok(findings[0].startsWith('source.ts:1: Inline'));
  assert.ok(findings[1].startsWith('source.ts:2: Inline'));
});
test('rejects typeof import annotations without affecting genuine lazy loading', () => {
  const text = "const load = async (): Promise<typeof import('./module')> => import('./module');";
  assert.equal(inspectSourceImports('source.ts', text).length, 1);
  assert.deepEqual(inspectSourceImports('source.ts', "const load = () => import('./module');"), []);
});
test('checks both Vue script blocks and reports original file line numbers', () => {
  const text =
    '<template><div /></template>\n<script lang="ts">\ntype X = import("./module").X;\n</script>\n<script setup lang="ts">\nconst x = 1;\nimport type { Y } from "./module";\n</script>';
  const findings = inspectSourceImports('view.vue', text);
  assert.equal(findings.length, 2);
  assert.ok(findings.some((value) => value.startsWith('view.vue:3: Inline')));
  assert.ok(findings.some((value) => value.startsWith('view.vue:7: Move')));
});
test('rejects static imports after declarations while keeping comments and environment directives', () => {
  assert.equal(
    inspectSourceImports('test.ts', "// @vitest-environment node\nconst setup=1;\nimport { x } from './x';").length,
    1,
  );
  assert.deepEqual(
    inspectSourceImports('test.ts', "// @vitest-environment node\nimport { x } from './x';\nconst setup=x;"),
    [],
  );
});
test('ignores examples in strings and comments, and accepts empty scripts and TSX', () => {
  assert.deepEqual(
    inspectSourceImports('source.ts', 'const example = "type X = import(\'x\').T";\n// import("x").T'),
    [],
  );
  assert.deepEqual(inspectSourceImports('empty.vue', '<template><div /></template>'), []);
  assert.deepEqual(inspectSourceImports('source.tsx', "import type { X } from './x';\nconst value=<span />;"), []);
});
test('rejects inline JSDoc import types too', () => {
  assert.equal(
    inspectSourceImports('source.js', "/** @type {import('./types').Settings} */\nconst value = {};").length,
    1,
  );
});
test('checks new untracked sources without scanning ignored generated output', () =>
  repository((root, write) => {
    write('.gitignore', 'generated/\n');
    write('generated/bad.ts', "type X=import('x').T;");
    write('src/bad.ts', "type X=import('x').T;");
    write('notes.md', "type X=import('x').T;");
    assert.equal(checkRepositoryTypeImports(root).length, 1);
    assert.ok(checkRepositoryTypeImports(root)[0].startsWith('src/bad.ts:1:'));
  }));
test('checks hidden source directories and filenames with spaces', () =>
  repository((root, write) => {
    write('.config/a view.vue', '<script setup lang="ts">type X=import("x").T;</script>');
    assert.equal(checkRepositoryTypeImports(root).length, 1);
    assert.ok(checkRepositoryTypeImports(root)[0].startsWith('.config/a view.vue:1:'));
  }));
test('accepts a repository with only valid imports or no source files', () =>
  repository((root, write) => {
    assert.deepEqual(checkRepositoryTypeImports(root), []);
    write('src/good.ts', "import type { X } from './x';\nexport type Y=X;");
    assert.deepEqual(checkRepositoryTypeImports(root), []);
  }));
