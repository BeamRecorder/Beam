// @vitest-environment node
import { expect, it } from 'vitest';
import { assertJsonValue, jsonObject } from './json-value';
it('accepts nested portable objects and arrays', () => {
  expect(() => assertJsonValue({ value: [null, false, 1, 'text', {}] })).not.toThrow();
  expect(jsonObject({ x: 1 })).toEqual({ x: 1 });
});
it('rejects executable, non-finite, cyclic and exotic values', () => {
  const cyclic: { child?: unknown } = {};
  cyclic.child = cyclic;
  for (const input of [undefined, Infinity, NaN, () => 0, new Date(), cyclic])
    expect(() => assertJsonValue(input)).toThrow();
  expect(() => jsonObject([])).toThrow();
  expect(() => jsonObject(1)).toThrow();
});
it('rejects prototype keys and unbounded nesting', () => {
  expect(() => assertJsonValue(JSON.parse('{"__proto__":{}}'))).toThrow('Unsafe');
  let nested: unknown = {};
  for (let depth = 0; depth < 66; depth++) nested = { child: nested };
  expect(() => assertJsonValue(nested)).toThrow('limits');
});
it('rejects getters, symbol/non-enumerable properties and sparse/named arrays without executing code', () => {
  let called = false;
  const getter = Object.defineProperty({}, 'value', {
    enumerable: true,
    get() {
      called = true;
      return 1;
    },
  });
  const hidden = Object.defineProperty({}, 'value', { value: 1 });
  const named = Object.assign([1], { label: 'bad' });
  for (const value of [getter, hidden, { [Symbol('id')]: 1 }, [, , ,], named])
    expect(() => assertJsonValue(value)).toThrow();
  expect(called).toBe(false);
});
it('caches deeply immutable JSON while retaining node/depth limits and checking mutable descendants', () => {
  const frozen = Object.freeze({ nested: Object.freeze({ value: 1 }) });
  assertJsonValue(frozen);
  assertJsonValue(frozen);
  expect(() => assertJsonValue(frozen, { maxNodes: 2, maxDepth: 10 })).toThrow('limits');
  expect(() => assertJsonValue({ wrapper: frozen }, { maxNodes: 10, maxDepth: 2 })).toThrow('limits');
  const child: { value: unknown } = { value: 1 },
    parent = Object.freeze({ child });
  assertJsonValue(parent);
  child.value = undefined;
  expect(() => assertJsonValue(parent)).toThrow();
  expect(() => assertJsonValue({ values: [1, 2] }, { maxNodes: 2, maxDepth: 8 })).toThrow('limits');
  expect(() => assertJsonValue(0, { maxNodes: 0, maxDepth: 0 })).toThrow('Invalid JSON limits');
  expect(() => assertJsonValue(0, { maxNodes: 1, maxDepth: -1 })).toThrow('Invalid JSON limits');
  expect(() => assertJsonValue(Object.assign(Object.create(null), { value: true }))).not.toThrow();
});
