import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { parse } from 'vue/compiler-sfc';

/** Inspect syntax, so deliberate runtime lazy loading and examples inside strings remain untouched. */
export function inspectSourceImports(filename, content) {
  const blocks = filename.endsWith('.vue')
    ? (() => {
        const { descriptor } = parse(content, { filename });
        return [descriptor.script, descriptor.scriptSetup]
          .filter(Boolean)
          .map((block) => ({ text: block.content, offset: block.loc.start.offset }));
      })()
    : [{ text: content, offset: 0 }];
  const failures = [];
  for (const { text, offset } of blocks) {
    const source = ts.createSourceFile(
      filename,
      text,
      ts.ScriptTarget.Latest,
      true,
      /\.[jt]sx$/.test(filename) ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const report = (node, message) => {
      const line = content.slice(0, offset + node.getStart(source)).split('\n').length;
      failures.push(`${filename}:${line}: ${message}`);
    };
    let bodyStarted = false;
    for (const statement of source.statements) {
      if (ts.isImportDeclaration(statement) || ts.isImportEqualsDeclaration(statement)) {
        if (bodyStarted) report(statement, 'Move this import to the top of the file or script block.');
      } else bodyStarted = true;
    }
    const visit = (node) => {
      if (ts.isImportTypeNode(node)) report(node, 'Inline import types are forbidden; use a top-level import type.');
      ts.forEachChild(node, visit);
      for (const comment of node.jsDoc ?? []) ts.forEachChild(comment, visit);
    };
    visit(source);
  }
  return failures;
}

export function checkRepositoryTypeImports(root) {
  const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  })
    .split('\0')
    .filter((file) => /\.(?:[cm]?[jt]sx?|vue)$/.test(file) && existsSync(path.join(root, file)));
  return files.flatMap((file) => inspectSourceImports(file, readFileSync(path.join(root, file), 'utf8')));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const failures = checkRepositoryTypeImports(fileURLToPath(new URL('../', import.meta.url)));
  if (failures.length) {
    process.stderr.write(failures.join('\n') + '\n');
    process.exitCode = 1;
  } else process.stdout.write('All static and type imports are at the top; no inline import types remain.\n');
}
