import { describe, expect, it } from 'vitest';
import { constant, curve, frames, keyframe, milliseconds, number, seconds } from '../src/time.ts';

describe('exact time and bindings', () => {
  it('uses reduced integer/rational time including fractional FPS', () => {
    expect(milliseconds(250)).toEqual({ ticks: 1, timescale: 4 });
    expect(milliseconds(0)).toEqual({ ticks: 0, timescale: 1 });
    expect(seconds('-1.25')).toEqual({ ticks: -5, timescale: 4 });
    expect(seconds(2)).toEqual({ ticks: 2, timescale: 1 });
    expect(frames(30_000, { numerator: 30_000, denominator: 1001 })).toEqual({ ticks: 1001, timescale: 1 });
    expect(frames(-1, { numerator: 24_000, denominator: 1001 })).toEqual({ ticks: -1001, timescale: 24_000 });
  });
  it('rejects unsafe ticks, timescales and invalid units', () => {
    for (const value of [NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1]) expect(() => milliseconds(value)).toThrow();
    for (const value of ['1e3', 'NaN', '.5', '0.00000000001', '9'.repeat(66), `0.${'1'.repeat(65)}`]) expect(() => seconds(value)).toThrow();
    expect(() => frames(0.5, { numerator: 30, denominator: 1 })).toThrow();
    expect(() => frames(1, { numerator: 0, denominator: 1 })).toThrow();
    expect(() => frames(1, { numerator: 1, denominator: 0 })).toThrow();
    expect(() => frames(Number.MAX_SAFE_INTEGER, { numerator: 1, denominator: 2 })).toThrow();
  });
  it('makes independent typed keyframes and ordered curves', () => {
    const a = keyframe(seconds(2), { kind: 'number', value: 2 });
    const b = keyframe(seconds(0), { kind: 'number', value: 0 }, { kind: 'constant' });
    const binding = curve('clipLocal', [a, b]);
    expect(binding.kind).toBe('curve');
    if (binding.kind !== 'curve') throw new Error('bad binding');
    expect(binding.keys.map((key) => key.time.ticks)).toEqual([0, 2]);
    a.value = { kind: 'number', value: 9 };
    expect(binding.keys[1]?.value).toEqual({ kind: 'number', value: 2 });
    expect(constant({ kind: 'boolean', value: true })).toEqual({ kind: 'constant', value: { kind: 'boolean', value: true } });
    expect(number(2)).toEqual({ kind: 'constant', value: { kind: 'number', value: 2 } });
    expect(() => number(Infinity)).toThrow();
    expect(() => curve('source', [])).toThrow();
    expect(() => curve('sequence', [a, keyframe({ ticks: 2000, timescale: 1000 }, { kind: 'number', value: 1 })])).toThrow();
  });
});
