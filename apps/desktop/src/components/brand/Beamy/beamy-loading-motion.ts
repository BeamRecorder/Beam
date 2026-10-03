import { BotEngine } from './engine/engine';
import { DEFAULT_EXPRESSION, EXPRESSION_BY_ID } from './engine/expressions';
import { DEFAULT_SHAPE, SHAPE_BY_ID } from './engine/skins';
import { RAYON } from './engine/repere';

export function createBeamyLoadingMotion() {
  const restingShape = SHAPE_BY_ID.get(DEFAULT_SHAPE)!.radii;
  const expression = EXPRESSION_BY_ID.get(DEFAULT_EXPRESSION)!;
  const engine = new BotEngine(RAYON, 'thinking', restingShape, expression);
  return (elapsed: number) => {
    const time = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
    // Start after the dots have emerged so even a very fast startup reads
    // as loading. The triangle appears only if loading lasts three seconds.
    engine.reset('thinking', -0.4);
    engine.setLook(null, -1);
    engine.setShape([...restingShape], -1);
    if (time >= 3) {
      engine.setState('idle', 3);
      engine.setShape(SHAPE_BY_ID.get('triangle')!.radii, 3);
      // The short face phase can fall entirely between the engine's natural blinks.
      engine.blink(3.6);
      const turn = ((Math.min(time, 4.2) - 3) / 1.2) * Math.PI * 2;
      engine.setLook(
        {
          yaw: expression.gaze.yaw + Math.sin(turn) * 6,
          pitch: expression.gaze.pitch + Math.sin(turn * 2) * 3,
          mix: 1,
          spin: 0,
          wander: 1,
        },
        -1,
      );
    }
    if (time >= 4.2) {
      engine.setState('thinking', 4.2);
      engine.setShape(restingShape, 4.2);
    }
    return engine.sample(time);
  };
}
