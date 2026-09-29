import { randomUUID } from 'node:crypto';
import type { Binding, FrameRate, Interpolation, Keyframe, Time, TimeSpace, Value } from './generated/contracts.ts';

const MAX_TICKS = BigInt(Number.MAX_SAFE_INTEGER);
function gcd(a: bigint, b: bigint): bigint { return b === 0n ? (a < 0n ? -a : a) : gcd(b, a % b); }
function rational(ticks: bigint, timescale: bigint): Time {
  const factor = gcd(ticks, timescale);
  ticks /= factor; timescale /= factor;
  if (ticks > MAX_TICKS || ticks < -MAX_TICKS || timescale < 1n || timescale > 4_294_967_295n) throw new RangeError('Time is outside the exact public representation');
  return { ticks: Number(ticks), timescale: Number(timescale) };
}
export function milliseconds(value: number): Time {
  if (!Number.isSafeInteger(value)) throw new RangeError('Milliseconds must be a safe integer');
  return rational(BigInt(value), 1000n);
}
export function seconds(value: string | number): Time {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(String(value));
  if (!match) throw new RangeError('Seconds require an exact decimal without an exponent');
  const fraction = match[3] ?? '';
  if (fraction.length > 64) throw new RangeError('Decimal input budget exceeded');
  const scale = 10n ** BigInt(fraction.length);
  const ticks = BigInt(match[2] ?? '0') * scale + BigInt(fraction || '0');
  return rational(match[1] ? -ticks : ticks, scale);
}
export function frames(index: number, rate: FrameRate): Time {
  if (!Number.isSafeInteger(index) || !Number.isSafeInteger(rate.numerator) || !Number.isSafeInteger(rate.denominator) || rate.numerator < 1 || rate.denominator < 1) throw new RangeError('Frame index and frame rate require exact positive rational units');
  return rational(BigInt(index) * BigInt(rate.denominator), BigInt(rate.numerator));
}
export function constant(value: Value): Binding { return { kind: 'constant', value }; }
export function number(value: number): Binding {
  if (!Number.isFinite(value)) throw new RangeError('Parameter value must be finite');
  return constant({ kind: 'number', value });
}
export function keyframe(time: Time, value: Value, interpolation: Interpolation = { kind: 'linear' }): Keyframe {
  return { id: randomUUID(), time, value, interpolation };
}
export function curve(space: TimeSpace, keys: Keyframe[]): Binding {
  if (!keys.length) throw new RangeError('A curve needs at least one keyframe');
  const ordered = structuredClone(keys).sort((a, b) => {
    const left = BigInt(a.time.ticks) * BigInt(b.time.timescale);
    const right = BigInt(b.time.ticks) * BigInt(a.time.timescale);
    return left < right ? -1 : left > right ? 1 : 0;
  });
  for (let index = 1; index < ordered.length; index++) {
    const previous = ordered[index - 1]!; const current = ordered[index]!;
    if (BigInt(previous.time.ticks) * BigInt(current.time.timescale) === BigInt(current.time.ticks) * BigInt(previous.time.timescale)) throw new RangeError('Keyframes need distinct times');
  }
  return { kind: 'curve', space, keys: ordered };
}
