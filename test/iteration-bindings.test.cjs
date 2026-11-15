const { isIterationBinding } = require('../scripts/iteration-bindings.mjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
test('recognizes only actual iteration bindings, including destructuring and nested closures', () => {
  for (const [source, expected] of [
    ['for (const [index, window] of windows) { consume(window.start); }', [true, true]],
    ['for (const window of window.items) { consume(window.start); }', [true, false, true]],
    ['for (const window of windows) {} window.document;', [true, false]],
    ['for (const {item: window} in windows) { (()=>window.start)(); }', [true, true]],
    ['window.document; const x=window;', [false, false]],
  ]) {
    const file = ts.createSourceFile('engine.ts', source, ts.ScriptTarget.Latest, true),
      actual = [];
    const visit = (node) => {
      if (ts.isIdentifier(node) && node.text === 'window') actual.push(isIterationBinding(node));
      ts.forEachChild(node, visit);
    };
    visit(file);
    assert.deepEqual(actual, expected, source);
  }
});
