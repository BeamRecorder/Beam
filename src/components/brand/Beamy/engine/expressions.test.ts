import { describe, expect, it } from 'vitest';
import { BotEngine } from './engine';
import { EXPRESSIONS, EXPRESSION_BY_ID, blendExpression } from './expressions';
import { radiusAtAngle } from './shape';
import { SHAPE_BY_ID } from './skins';
const cercle = () => SHAPE_BY_ID.get('cercle')!.radii;

function rendu(matrix: string, w: number, h: number) {
  const [a, b, c, d, e, f] = /matrix\(([^)]+)\)/.exec(matrix)![1]!.split(',').map(Number) as number[];
  return {
    x: e!,
    y: f!,
    largeur: Math.hypot(a!, b!) * w,
    hauteur: Math.hypot(c!, d!) * h,
    axe: (Math.atan2(d!, c!) * 180) / Math.PI - 90,
  };
}
describe('catalogue des expressions', () => {
  it('expose 16 expressions aux identifiants uniques', () => {
    expect(EXPRESSIONS).toHaveLength(16);
    expect(new Set(EXPRESSIONS.map((e) => e.id)).size).toBe(16);
    expect(EXPRESSION_BY_ID.size).toBe(16);
  });

  it('n incline que des yeux assez allonges pour que ca se voie', () => {
    for (const e of EXPRESSIONS) {
      for (const oeil of e.eyes) {
        const tilt = Math.abs(oeil.tilt ?? 0);
        if (tilt < 1) continue;
        const rapport = oeil.w / oeil.h;
        const seuil = tilt >= 20 ? [0.6, 1.7] : [0.8, 1.25];
        expect(
          rapport < seuil[0]! || rapport > seuil[1]!,
          `${e.id}: rapport ${rapport.toFixed(2)} trop proche de 1 pour une inclinaison de ${tilt}deg`,
        ).toBe(true);
      }
    }
  });
  it('incline la colere et la tristesse en miroir, et dans des sens opposes', () => {
    const angles = (id: string) => {
      const f = new BotEngine(100, 'idle', cercle(), EXPRESSION_BY_ID.get(id)!).sample(1);
      const e = EXPRESSION_BY_ID.get(id)!;
      return f.eyes.map((oeil, i) => rendu(oeil.matrix, e.eyes[i]!.w, e.eyes[i]!.h).axe);
    };
    const colere = angles('colere');
    const triste = angles('triste');
    // en miroir : les deux yeux penchent a l'oppose l'un de l'autre
    expect(Math.sign(colere[0]!)).toBe(-Math.sign(colere[1]!));
    expect(Math.sign(triste[0]!)).toBe(-Math.sign(triste[1]!));
    // et les deux emotions sont inversees l'une par rapport a l'autre
    expect(Math.sign(colere[0]!)).toBe(-Math.sign(triste[0]!));
  });
  it('garde les deux yeux dans la silhouette, sur les 16 expressions', () => {
    for (const e of EXPRESSIONS) {
      const f = new BotEngine(100, 'idle', cercle(), e).sample(1);
      expect(f.eyes, e.id).toHaveLength(2);
      for (let i = 0; i < 2; i++) {
        const r = rendu(f.eyes[i]!.matrix, e.eyes[i]!.w, e.eyes[i]!.h);
        // demi-diagonale de l'oeil : le coin le plus lointain doit rester dedans
        const demi = Math.hypot(r.largeur, r.hauteur) / 2;
        const bord = radiusAtAngle(cercle(), Math.atan2(r.y, r.x)) * 100;
        expect(Math.hypot(r.x, r.y) + demi, `${e.id} oeil ${i}`).toBeLessThan(bord * 1.02);
      }
    }
  });
});
describe('changement d expression', () => {
  it('interpole la geometrie de facon monotone', () => {
    // On mesure sur blendExpression, pas sur le rendu : la derive du regard au
    // repos fait varier la projection, donc la hauteur a l'ecran n'est pas
    // monotone meme quand l'interpolation, elle, l'est.
    const de = EXPRESSION_BY_ID.get('neutre')!;
    const vers = EXPRESSION_BY_ID.get('effraye')!;
    const hauteurs = [0, 0.25, 0.5, 0.75, 1].map((t) => blendExpression(de, vers, t).eyes[0]!.h);
    for (let i = 1; i < hauteurs.length; i++) {
      expect(hauteurs[i]!).toBeGreaterThan(hauteurs[i - 1]!);
    }
    expect(hauteurs[0]!).toBeCloseTo(de.eyes[0]!.h, 5);
    expect(hauteurs[4]!).toBeCloseTo(vers.eyes[0]!.h, 5);
  });
  it('glisse vers la nouvelle expression au lieu de sauter', () => {
    const cible = EXPRESSION_BY_ID.get('effraye')!;
    const e = new BotEngine(100, 'idle', cercle(), EXPRESSION_BY_ID.get('neutre')!);
    e.setExpression(cible, 1);
    // juste apres le changement, l'oeil n'a pas encore la forme de la cible...
    const tot = e.sample(1.02).eyes[0]!.d;
    const arrive = new BotEngine(100, 'idle', cercle(), cible).sample(1).eyes[0]!.d;
    expect(tot).not.toBe(arrive);
    // ...et il l'a une fois le morph termine
    expect(e.sample(1 + BotEngine.SHAPE_MORPH + 0.05).eyes[0]!.d).toBe(arrive);
  });
  it('reste une fonction pure du temps pendant le morph', () => {
    const e = new BotEngine(100, 'idle', cercle(), EXPRESSION_BY_ID.get('neutre')!);
    e.setExpression(EXPRESSION_BY_ID.get('colere')!, 1);
    const milieu = e.sample(1.12).eyes[0]!.matrix;
    e.sample(3);
    expect(e.sample(1.12).eyes[0]!.matrix).toBe(milieu);
  });
  it('n applique l expression qu a l etat de repos', () => {
    const expr = EXPRESSION_BY_ID.get('effraye')!;
    // wink a son expression propre, relevee sur la video : elle doit survivre
    const nu = new BotEngine(100, 'wink', cercle()).sample(1);
    const habille = new BotEngine(100, 'wink', cercle(), expr).sample(1);
    expect(habille.eyes[0]!.d).toBe(nu.eyes[0]!.d);
    const repos = new BotEngine(100, 'idle', cercle(), expr).sample(1);
    const reposNu = new BotEngine(100, 'idle', cercle()).sample(1);
    expect(repos.eyes[0]!.d).not.toBe(reposNu.eyes[0]!.d);
  });
  it('interpole toutes les composantes, inclinaison comprise', () => {
    const a = EXPRESSION_BY_ID.get('colere')!;
    const b = EXPRESSION_BY_ID.get('triste')!;
    const m = blendExpression(a, b, 0.5);
    expect(m.eyes[0]!.tilt).toBeCloseTo(((a.eyes[0]!.tilt ?? 0) + (b.eyes[0]!.tilt ?? 0)) / 2, 5);
    expect(m.split).toBeCloseTo((a.split + b.split) / 2, 5);
    expect(m.gaze.pitch).toBeCloseTo((a.gaze.pitch + b.gaze.pitch) / 2, 5);
  });
});
