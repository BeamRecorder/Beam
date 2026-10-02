import type { HeadGaze } from './bot-types';
import { describe, expect, it } from 'vitest';
import { EYE_H, EYE_SPLIT, EYE_W, REST_GAZE, eyePoses } from './face';

const MESURES: Array<{
  nom: string;
  gaze: HeadGaze;
  split: number;
  w: number;
  h: number;
  yeux: Array<{
    x: number;
    y: number;
    court: number;
    long: number;
  }>;
}> = [
  {
    nom: 'repos',
    gaze: REST_GAZE,
    split: EYE_SPLIT,
    w: EYE_W,
    h: EYE_H,
    yeux: [
      { x: 0.189, y: -0.412, court: 0.178, long: 0.39 },
      { x: 0.614, y: -0.51, court: 0.12, long: 0.395 },
    ],
  },
  {
    nom: 'yeux ecarquilles',
    gaze: { yaw: 6.92, pitch: -21.96, roll: 11.6 },
    split: 18.43,
    w: 0.356,
    h: 0.875,
    yeux: [
      { x: -0.198, y: 0.295, court: 0.353, long: 0.82 },
      { x: 0.412, y: 0.415, court: 0.315, long: 0.826 },
    ],
  },
  {
    nom: 'notification',
    gaze: { yaw: -21.94, pitch: -5.82, roll: -12.2 },
    split: 18.89,
    w: 0.505,
    h: 0.498,
    yeux: [
      { x: -0.675, y: 0.172, court: 0.39, long: 0.495 },
      { x: -0.059, y: 0.027, court: 0.495, long: 0.5 },
    ],
  },
];
const court = (e: ReturnType<typeof eyePoses>[number], w: number) => Math.hypot(e.a, e.b) * w;
const long = (e: ReturnType<typeof eyePoses>[number], h: number) => Math.hypot(e.c, e.d) * h;
describe('yeux poses sur une sphere', () => {
  for (const m of MESURES) {
    it(`reproduit la pose "${m.nom}" mesuree sur la video`, () => {
      const poses = eyePoses(m.gaze, 1, m.split);
      for (let i = 0; i < 2; i++) {
        const p = poses[i]!;
        const attendu = m.yeux[i]!;
        // 0.04 rayon = ~7 px sur la boule de 190 px de la video
        expect(p.x).toBeCloseTo(attendu.x, 1);
        expect(p.y).toBeCloseTo(attendu.y, 1);
        expect(Math.abs(court(p, m.w) - attendu.court)).toBeLessThan(0.04);
        expect(Math.abs(long(p, m.h) - attendu.long)).toBeLessThan(0.04);
      }
    });
  }
  it('comprime l oeil exactement du facteur de profondeur de la sphere', () => {
    // Invariant exact : le determinant du repere tangent projete vaut z. C'est
    // lui qui fait que l'aire de l'oeil suit la courbure (mesure : 0.663).
    for (const e of eyePoses(REST_GAZE, 1)) {
      expect(e.a * e.d - e.b * e.c).toBeCloseTo(e.depth, 6);
    }
    const [proche, loin] = eyePoses(REST_GAZE, 1);
    expect(loin.depth / proche.depth).toBeCloseTo(0.663, 1);
    // mesure video de la largeur : 0.120 / 0.178 = 0.674
    expect(court(loin, EYE_W) / court(proche, EYE_W)).toBeCloseTo(0.674, 1);
  });
  it('garde la meme longueur pour les deux yeux (axe tangentiel non deforme)', () => {
    const [a, b] = eyePoses(REST_GAZE, 1);
    expect(long(a, EYE_H)).toBeCloseTo(long(b, EYE_H), 3);
  });
  it('conserve la separation angulaire de 31 degres quel que soit le regard', () => {
    for (const gaze of [REST_GAZE, { yaw: -40, pitch: 10, roll: 5 }, { yaw: 0, pitch: 0, roll: 0 }]) {
      const [a, b] = eyePoses(gaze, 1);
      const dot = a.x * b.x + a.y * b.y + a.depth * b.depth;
      expect((Math.acos(dot) * 180) / Math.PI).toBeCloseTo(EYE_SPLIT * 2, 4);
    }
  });
  it('fait passer un oeil derriere la sphere quand la tete tourne fort', () => {
    const [, loin] = eyePoses({ yaw: 80, pitch: 0, roll: 0 }, 1);
    expect(loin.depth).toBeLessThan(0);
  });
});
