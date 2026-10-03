import type { JsonValue, JsonLimits } from './json-types';

const validated = new WeakMap<object, { nodes: number; depth: number }>();
const DEFAULT_LIMITS: JsonLimits = { maxNodes: 5_000_000, maxDepth: 64 };

/** Validated, deeply frozen subtrees can be checked in constant time on the next edit. */
export function assertJsonValue(value: unknown, limits: JsonLimits = DEFAULT_LIMITS): asserts value is JsonValue {
  if (
    !Number.isSafeInteger(limits.maxNodes) ||
    limits.maxNodes < 1 ||
    !Number.isSafeInteger(limits.maxDepth) ||
    limits.maxDepth < 0
  )
    throw new RangeError('Invalid JSON limits.');
  let nodes = 0;
  const ancestors = new Set<object>();
  const visit = (input: unknown, depth: number): { immutable: boolean; depth: number } => {
    if (++nodes > limits.maxNodes || depth > limits.maxDepth)
      throw new RangeError('JSON document exceeds structural limits.');
    if (
      input === null ||
      typeof input === 'string' ||
      typeof input === 'boolean' ||
      (typeof input === 'number' && Number.isFinite(input))
    )
      return { immutable: true, depth: 0 };
    if (!input || typeof input !== 'object') throw new TypeError('Expected portable JSON data.');
    const cached = validated.get(input);
    if (cached) {
      nodes += cached.nodes - 1;
      if (nodes > limits.maxNodes || depth + cached.depth > limits.maxDepth)
        throw new RangeError('JSON document exceeds structural limits.');
      return { immutable: true, depth: cached.depth };
    }
    if (ancestors.has(input)) throw new TypeError('JSON data contains a cycle.');
    const array = Array.isArray(input);
    if (!array && ![Object.prototype, null].includes(Object.getPrototypeOf(input)))
      throw new TypeError('JSON objects must have a plain prototype.');
    if (Object.getOwnPropertySymbols(input).length) throw new TypeError('JSON cannot contain symbol properties.');
    const keys = Object.getOwnPropertyNames(input).filter((key) => !array || key !== 'length');
    if (array && (keys.length !== input.length || keys.some((key, index) => key !== String(index))))
      throw new TypeError('JSON arrays must be dense and have no named properties.');
    ancestors.add(input);
    const startNodes = nodes;
    let immutable = Object.isFrozen(input),
      childDepth = 0;
    for (const key of keys) {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new TypeError('Unsafe JSON key.');
      const descriptor = Object.getOwnPropertyDescriptor(input, key)!;
      if (!descriptor.enumerable || !('value' in descriptor))
        throw new TypeError('JSON properties must be enumerable data.');
      const child = visit(descriptor.value, depth + 1);
      immutable = immutable && child.immutable;
      childDepth = Math.max(childDepth, 1 + child.depth);
    }
    ancestors.delete(input);
    if (immutable) validated.set(input, { nodes: nodes - startNodes + 1, depth: childDepth });
    return { immutable, depth: childDepth };
  };
  visit(value, 0);
}

export function jsonObject(value: unknown): Record<string, JsonValue> {
  assertJsonValue(value);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Expected a JSON object.');
  return value;
}
