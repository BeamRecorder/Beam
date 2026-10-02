import { BotEngine } from './engine/engine';
import { DEFAULT_EXPRESSION, EXPRESSION_BY_ID } from './engine/expressions';
import { DEFAULT_SHAPE, SHAPE_BY_ID } from './engine/skins';
import { RAYON } from './engine/repere';

export function createBeamyLoadingMotion() {
  const restingShape = SHAPE_BY_ID.get(DEFAULT_SHAPE)!.radii;
  const engine = new BotEngine(RAYON, 'thinking', restingShape, EXPRESSION_BY_ID.get(DEFAULT_EXPRESSION)!);
  return (elapsed: number) => {
    const time = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
    // Start after the dots have emerged so even a very fast startup reads
    // as loading. The triangle appears only if loading lasts three seconds.
    engine.reset('thinking', -0.4);
    engine.setShape([...restingShape], -1);
    if (time >= 3) {
      engine.setState('idle', 3);
      engine.setShape(SHAPE_BY_ID.get('triangle')!.radii, 3);
    }
    if (time >= 4.2) {
      engine.setState('thinking', 4.2);
      engine.setShape(restingShape, 4.2);
    }
    return engine.sample(time);
  };
}
