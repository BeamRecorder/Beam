import { describe, expect, it } from 'vitest';
import { TAU } from './math';
import { PROFILE_SAMPLES } from './profiles';
import { radiusAtAngle, silhouette } from './shape';
import { SHAPES } from './skins';

const TRIANGLE = silhouette('triangle').radii;
describe('radiusAtAngle', () => {
  it('rend le rayon du profil, pas une constante', () => {
    const vus = new Set(Array.from({ length: 16 }, (_, i) => radiusAtAngle(TRIANGLE, (i / 16) * TAU)));
    expect(vus.size).toBeGreaterThan(8);
  });
  it('enroule les angles negatifs', () => {
    expect(radiusAtAngle(TRIANGLE, -0.1)).toBeCloseTo(radiusAtAngle(TRIANGLE, TAU - 0.1), 12);
    expect(radiusAtAngle(TRIANGLE, -1)).toBeCloseTo(radiusAtAngle(TRIANGLE, TAU - 1), 12);
  });

  it('enroule sur plusieurs tours, dans les deux sens', () => {
    for (const base of [-30, -12.5, 7.3]) {
      for (const tours of [-3, -1, 1, 5]) {
        expect(radiusAtAngle(TRIANGLE, base), `base=${base} tours=${tours}`).toBeCloseTo(
          radiusAtAngle(TRIANGLE, base + tours * TAU),
          10,
        );
      }
    }
  });

  it('est continue au passage par zero', () => {
    expect(radiusAtAngle(TRIANGLE, -1e-9)).toBeCloseTo(radiusAtAngle(TRIANGLE, 1e-9), 8);
    // et la valeur y est bien celle du profil, pas un repli
    expect(radiusAtAngle(TRIANGLE, 0)).toBeCloseTo(TRIANGLE[0]!, 12);
  });
});

describe('profils des formes du personnalisateur', () => {
  it('ont tous le meme echantillonnage angulaire, fini et positif', () => {
    for (const forme of SHAPES) {
      expect(forme.radii, forme.id).toHaveLength(PROFILE_SAMPLES);
      for (const [i, r] of forme.radii.entries()) {
        expect(Number.isFinite(r), `${forme.id}[${i}] = ${r}`).toBe(true);
        expect(r, `${forme.id}[${i}]`).toBeGreaterThan(0);
      }
    }
  });

  it('restent dans un domaine ou le reste du moteur tient', () => {
    for (const forme of SHAPES) {
      const min = Math.min(...forme.radii);
      const max = Math.max(...forme.radii);
      expect(min, `${forme.id} min`).toBeGreaterThan(0.3);
      expect(max, `${forme.id} max`).toBeLessThan(1.6);
    }
  });
});
