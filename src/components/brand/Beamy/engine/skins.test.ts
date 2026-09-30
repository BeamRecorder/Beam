import type { RenderedEye, StateId } from './bot-types';
import { describe, expect, it } from 'vitest';
import { BotEngine } from './engine';
import { decalageDesYeux, POUR_TESTS } from './eyefit';
import { EXPRESSIONS } from './expressions';
import { DEFAULT_SHAPE, SHAPES, SHAPE_BY_ID } from './skins';
import { STATES } from './states';

const R = 100;

function contourDuCorps(d: string) {
  const pts: Array<{
    x: number;
    y: number;
  }> = [];
  for (const seg of d.slice(1).split('C')) {
    const n = seg.match(/-?\d+\.?\d*/g)?.map(Number) ?? [];
    if (n.length >= 6) pts.push({ x: n[4]!, y: n[5]! });
    else if (n.length === 2) pts.push({ x: n[0]!, y: n[1]! });
  }
  return pts;
}

function dedans(
  poly: Array<{
    x: number;
    y: number;
  }>,
  x: number,
  y: number,
) {
  let on = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) on = !on;
  }
  return on;
}

function contourDeLOeil(eye: RenderedEye, N = 32) {
  const g = eye.d.match(/-?\d+\.?\d*/g)!.map(Number);
  const hw = Math.abs(g[0]!);
  const r = Math.abs(g[2]!);
  const droit = Math.abs(g[1]!);
  const m = eye.matrix.match(/-?\d+\.?\d*/g)!.map(Number);
  const [a, b, c, d, e, f] = m as [number, number, number, number, number, number];
  const out: Array<{
    x: number;
    y: number;
  }> = [];
  for (let i = 0; i < N; i++) {
    const u = (i / N) * 4;
    let x: number;
    let y: number;
    if (u < 1) {
      const t = Math.PI * (u - 0.5);
      x = Math.cos(t) * r;
      y = -droit + Math.sin(t) * r;
    } else if (u < 2) {
      x = hw;
      y = -droit + (u - 1) * 2 * droit;
    } else if (u < 3) {
      const t = Math.PI * (u - 2 + 0.5);
      x = Math.cos(t) * r;
      y = droit + Math.sin(t) * r;
    } else {
      x = -hw;
      y = droit - (u - 3) * 2 * droit;
    }
    out.push({ x: a * x + c * y + e, y: b * x + d * y + f });
  }
  return out;
}

const INSTANTS = 60;
const PAS = 1 / 20;

function debordement(state: StateId, radii: number[], expr: (typeof EXPRESSIONS)[number] | null) {
  const e = new BotEngine(R, state, radii, expr);
  let pire = 0;
  for (let i = 0; i < INSTANTS; i++) {
    const f = e.sample(i * PAS);
    const corps = contourDuCorps(f.bodyPath);
    for (const eye of f.eyes) {
      for (const p of contourDeLOeil(eye)) {
        if (dedans(corps, p.x, p.y)) continue;
        pire = Math.max(pire, Math.min(...corps.map((q) => Math.hypot(q.x - p.x, q.y - p.y))));
      }
    }
  }
  return pire;
}

const CORPS_DE_BASE = STATES.filter((s) => s.baseBody).map((s) => s.id);

const SILHOUETTE_MESUREE = STATES.filter((s) => !s.baseBody).map((s) => s.id);
describe('formes du personnalisateur', () => {
  // 680 combinaisons x 60 instants x deux contours : le test le plus lourd du depot, et le
  // seul qui prouve ce que l'oeil voit.
  it('aucune forme ne laisse un oeil sortir de la silhouette', () => {
    const fautifs: string[] = [];
    for (const state of CORPS_DE_BASE) {
      for (const forme of SHAPES) {
        for (const expr of [null, ...EXPRESSIONS]) {
          const sortie = debordement(state, forme.radii, expr);
          if (sortie > 0.05) {
            fautifs.push(`${state}/${forme.id}/${expr?.id ?? 'pose'} ${sortie.toFixed(1)}`);
          }
        }
      }
    }
    // Cinq couples etat x forme debordaient : `wide`+`capsule` de 14,5 unites sur une boule
    // de rayon 100, `wide`+`triangle` de 11,9, `idle`+`capsule` et `swirl`+`capsule` de 5,3,
    // `notify`+`goutte` de 3,3.
    expect(fautifs).toEqual([]);
  }, 60000);

  it('choisir le cercle rend exactement la meme chose que ne rien choisir', () => {
    expect(DEFAULT_SHAPE).toBe('cercle');
    const cercle = SHAPE_BY_ID.get('cercle')!.radii;
    for (const state of CORPS_DE_BASE) {
      for (const expr of [null, ...EXPRESSIONS]) {
        const avec = new BotEngine(R, state, cercle, expr).sample(1);
        const sans = new BotEngine(R, state, null, expr).sample(1);
        expect(avec.eyes, `${state}/${expr?.id ?? 'pose'}`).toEqual(sans.eyes);
      }
      expect(decalageDesYeux(cercle, state, null)).toEqual({ x: 0, y: 0 });
    }
  });

  it('la forme choisie ne touche pas aux etats a silhouette mesuree', () => {
    for (const state of SILHOUETTE_MESUREE) {
      const nu = new BotEngine(R, state, null, null).sample(1);
      for (const forme of SHAPES) {
        const habille = new BotEngine(R, state, forme.radii, null).sample(1);
        expect(habille.eyes, `${state}/${forme.id}`).toEqual(nu.eyes);
        expect(habille.bodyPath).toBe(nu.bodyPath);
      }
    }
  });

  it('la taille des yeux ne depend pas de la forme', () => {
    const tailles = new Set(
      SHAPES.map((f) =>
        new BotEngine(R, 'idle', f.radii, null)
          .sample(1)
          .eyes.map((y) => y.d)
          .join('|'),
      ),
    );
    expect(tailles.size).toBe(1);
  });

  it('la correction ne fait pas osciller les yeux', () => {
    const pas = 1 / 60;
    const trajectoire = (bâti: () => BotEngine, duree = BotEngine.SHAPE_MORPH) => {
      const e = bâti();
      const out: Array<
        Array<{
          x: number;
          y: number;
        }>
      > = [];
      for (let t = 0; t <= duree + pas; t += pas) {
        out.push(
          e.sample(t).eyes.map((eye) => {
            const n = eye.matrix.match(/-?\d+\.?\d*/g)!.map(Number);
            return { x: n[4]!, y: n[5]! };
          }),
        );
      }
      return out;
    };

    const allersRetours = (
      suite: Array<
        Array<{
          x: number;
          y: number;
        }>
      >,
    ) => {
      let n = 0;
      let amplitude = 0;
      const yeux = Math.min(...suite.map((f) => f.length));
      for (let j = 0; j < yeux; j++) {
        let px = 0;
        let py = 0;
        for (let i = 1; i < suite.length; i++) {
          const dx = suite[i]![j]!.x - suite[i - 1]![j]!.x;
          const dy = suite[i]![j]!.y - suite[i - 1]![j]!.y;
          const len = Math.hypot(dx, dy);
          if (len <= 0.05) continue;
          if ((px || py) && dx * px + dy * py < 0) {
            n++;
            amplitude = Math.max(amplitude, len);
          }
          px = dx;
          py = dy;
        }
      }
      return { n, amplitude };
    };
    const cercle = SHAPE_BY_ID.get('cercle')!.radii;
    const morphDeForme = (radii: number[]) =>
      allersRetours(
        trajectoire(() => {
          const e = new BotEngine(R, 'idle', cercle, null);
          e.setShape(radii, 0);
          return e;
        }),
      );
    const auRepos = (radii: number[]) => allersRetours(trajectoire(() => new BotEngine(R, 'idle', radii, null), 3));
    const morphsDExpression = (radii: number[]) =>
      EXPRESSIONS.map((expr) =>
        allersRetours(
          trajectoire(() => {
            const e = new BotEngine(R, 'idle', radii, EXPRESSIONS[0]!);
            e.setExpression(expr, 0);
            return e;
          }),
        ),
      ).reduce((a, b) => ({ n: a.n + b.n, amplitude: Math.max(a.amplitude, b.amplitude) }), {
        n: 0,
        amplitude: 0,
      });
    /*
     * Sur le CERCLE, rien du tout : la correction y est nulle, donc elle ne peut ajouter
     * aucun mouvement, et c'est la reference des trois comparaisons.
     */
    expect(morphsDExpression(cercle).n, 'cercle : morphs d expression').toBe(0);
    for (const forme of SHAPES) {
      // Au repos, la seule chose qui bouge est la derive du regard. Une correction qui la
      // suivrait ferait trembler les yeux en permanence : c'est le defaut le plus visible
      // de tous, et le premier qu'on a eu.
      expect(auRepos(forme.radii).n, `${forme.id} : derive au repos`).toBeLessThanOrEqual(auRepos(cercle).n + 1);
      // Un changement de forme fait bouger le decalage, mais sur la meme courbe que la
      // silhouette : aucun aller-retour de plus que le cercle.
      expect(morphDeForme(forme.radii).n, `morph de forme vers ${forme.id}`).toBeLessThanOrEqual(
        morphDeForme(cercle).n + 1,
      );
      /*
       * Un changement d'expression fait passer le decalage d'une entree de table a l'autre.
       * Sept formes sur huit n'y gagnent aucun aller-retour ; la `goutte` passe de un
       * rebroussement de 6,3 unites — deja present sans correction — a deux de 11,1. La
       * borne laisse passer ca et rien de plus : les versions fautives etaient a 26.
       */
      expect(morphsDExpression(forme.radii).amplitude, `${forme.id} : morphs d expression`).toBeLessThan(14);
    }
  });

  it('la table reconstruite conserve les corrections déterministes', () => {
    const rebuilt = POUR_TESTS.batir();
    expect(rebuilt.size).toBe(SHAPES.length);
    for (const shape of SHAPES) {
      for (const expression of EXPRESSIONS) {
        expect(rebuilt.get(shape.radii)?.get(`idle|${expression.id}`)).toEqual(
          decalageDesYeux(shape.radii, 'idle', expression.id),
        );
      }
    }
  });
});
