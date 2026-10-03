import { expect, it } from 'vitest';
import { BotEngine } from './engine';
const eyeHeight = (engine: BotEngine, time: number) =>
  Math.abs(Number(engine.sample(time).eyes[0]!.matrix.match(/-?\d+(?:\.\d+)?/g)![3]));
it('schedules a blink without changing the pose and reopens both eyes', () => {
  const engine = new BotEngine();
  engine.blink(3.6);
  expect(engine.state).toBe('idle');
  expect(eyeHeight(engine, 3.7)).toBeLessThan(eyeHeight(engine, 3.55) / 10);
  expect(eyeHeight(engine, 3.85)).toBeGreaterThan(eyeHeight(engine, 3.7) * 10);
  expect(engine.sample(3.7).eyes).toHaveLength(2);
});
it('ignores invalid blink timestamps and preserves the last valid schedule', () => {
  const engine = new BotEngine();
  engine.blink(3.6);
  const closed = engine.sample(3.7);
  for (const time of [NaN, Infinity, -Infinity]) {
    engine.blink(time);
    expect(engine.sample(3.7)).toEqual(closed);
  }
});
it('replaces the scheduled blink and clears it when resetting the engine', () => {
  const engine = new BotEngine();
  engine.blink(3.6);
  engine.blink(3.9);
  expect(eyeHeight(engine, 3.7)).toBeGreaterThan(eyeHeight(engine, 4) * 10);
  engine.reset('idle', 0);
  expect(engine.sample(4)).toEqual(new BotEngine().sample(4));
});
