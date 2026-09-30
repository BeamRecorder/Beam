import type {
  RenderedEye,
  BotFrame,
  Look,
  BotExpression,
  Point,
  Silhouette,
  Pose,
  StateId,
  StateDef,
} from './bot-types';
import { arcRender } from './decor';
import { blendExpression } from './expressions';
import { decalageDesYeux } from './eyefit';
import { blinkScale, eyePoses, liveliness } from './face';
import { clamp, easings, lerp, r2 } from './math';
import { blend, closedPath, radiusAtAngle, toPoints } from './shape';
import { eyeShapePath } from './eye-shape';
import type { EyeStyle } from '../mascot-types';
import { STATE_BY_ID } from './states';
const NO_LOOK: Look = { yaw: 0, pitch: 0, mix: 0, spin: 0, wander: 1 };
const lerpLook = (a: Look, b: Look, t: number): Look => ({
  yaw: lerp(a.yaw, b.yaw, t),
  pitch: lerp(a.pitch, b.pitch, t),
  mix: lerp(a.mix, b.mix, t),
  spin: lerp(a.spin, b.spin, t),
  wander: lerp(a.wander, b.wander, t),
});
const lerpEye = (a: Pose['eyes'][number], b: Pose['eyes'][number], t: number) => ({
  w: lerp(a.w, b.w, t),
  h: lerp(a.h, b.h, t),
  open: lerp(a.open, b.open, t),
  tilt: lerp(a.tilt ?? 0, b.tilt ?? 0, t),
});

function blendPose(a: Pose, b: Pose, t: number): Pose {
  const out = 1 - t;
  return {
    sil: blend(a.sil, b.sil, t),
    offX: lerp(a.offX, b.offX, t),
    offY: lerp(a.offY, b.offY, t),
    gaze: {
      yaw: lerp(a.gaze.yaw, b.gaze.yaw, t),
      pitch: lerp(a.gaze.pitch, b.gaze.pitch, t),
      roll: lerp(a.gaze.roll, b.gaze.roll, t),
    },
    split: lerp(a.split, b.split, t),
    eyes: [lerpEye(a.eyes[0], b.eyes[0], t), lerpEye(a.eyes[1], b.eyes[1], t)],
    eyeAlpha: lerp(a.eyeAlpha, b.eyeAlpha, t),
    bodyAlpha: lerp(a.bodyAlpha, b.bodyAlpha, t),
    dots: [
      ...a.dots.map((d) => ({ ...d, opacity: d.opacity * out })),
      ...b.dots.map((d) => ({ ...d, opacity: d.opacity * t })),
    ],
    arcs: [
      ...a.arcs.map((r) => ({ ...r, id: `a${r.id}`, opacity: r.opacity * out })),
      ...b.arcs.map((r) => ({ ...r, id: `b${r.id}`, opacity: r.opacity * t })),
    ],
    // la pastille appartient a un seul des deux etats, elle ne se melange pas
    notif: t < 0.5 ? a.notif : b.notif,
    dotsBehind: t < 0.5 ? a.dotsBehind : b.dotsBehind,
  };
}

export class BotEngine {
  readonly scale: number;
  private cur: StateId;
  private prev: StateId | null = null;

  private departFige: Pose | null = null;
  private tCur = 0;
  private tPrev = 0;
  private blinkAt = -10;
  private pts: Point[] = [];
  private shape: number[] | null = null;
  private shapePrev: number[] | null = null;
  private shapeAt = -10;
  private expr: BotExpression | null = null;
  private exprPrev: BotExpression | null = null;
  private exprAt = -10;
  private look: Look = NO_LOOK;
  private lookPrev: Look = NO_LOOK;
  private lookAt = -10;

  private lookMorph = 0.24;
  private eyeStyle: EyeStyle = 'capsule';
  private eyeFrom: EyeStyle = 'capsule';
  private eyeAt = -10;

  static readonly SHAPE_MORPH = 0.45;

  static readonly LOOK_MORPH = 0.24;
  constructor(
    scale = 100,
    initial: StateId = 'idle',
    shape: number[] | null = null,
    expression: BotExpression | null = null,
  ) {
    this.scale = scale;
    this.cur = initial;
    this.shape = shape;
    this.expr = expression;
  }
  setEyes(style: EyeStyle, now = 0) {
    if (style === this.eyeStyle) return;
    this.eyeFrom = this.eyeStyle;
    this.eyeStyle = style;
    this.eyeAt = now;
  }

  setExpression(expression: BotExpression | null, now = 0) {
    if (expression === this.expr) return;
    this.exprPrev = this.expr;
    this.expr = expression;
    this.exprAt = now;
  }

  private exprAtTime(now: number): BotExpression | null {
    const to = this.expr;
    const from = this.exprPrev;
    if (!to || !from) return to;
    const k = (now - this.exprAt) / BotEngine.SHAPE_MORPH;
    if (k >= 1) return to;
    return blendExpression(from, to, easings.easeOutQuint(clamp(k)));
  }

  setShape(radii: number[] | null, now = 0) {
    if (radii === this.shape) return;
    this.shapePrev = this.shape;
    this.shape = radii;
    this.shapeAt = now;
  }

  private shapeAtTime(now: number): number[] | null {
    const to = this.shape;
    const from = this.shapePrev;
    if (!to || !from) return to;
    const k = (now - this.shapeAt) / BotEngine.SHAPE_MORPH;
    if (k >= 1) return to;
    const t = easings.easeOutQuint(clamp(k));
    // alloue seulement pendant le morph ; hors morph on rend le tableau tel quel
    return to.map((r, i) => lerp(from[i] ?? r, r, t));
  }

  setLook(look: Look | null, now: number, morph = BotEngine.LOOK_MORPH) {
    /*
     * Une cible non finie est refusee. Le moteur GARDE la derniere : un `NaN`
     * pose une seule fois se propagerait a chaque image et le bot ne se
     * reposerait plus jamais. C'est arrive pour de vrai — un
     * `getBoundingClientRect` sur une boite de taille nulle donne `0 / 0` chez
     * l'appelant. Celui-la est corrige, mais le moteur n'a pas a dependre de la
     * prudence de ses appelants pour rester rejouable.
     */
    if (look && !Number.isFinite(look.yaw + look.pitch + look.mix + look.spin + look.wander)) {
      return;
    }
    this.lookPrev = this.lookAtTime(now);
    this.look = look ?? NO_LOOK;
    this.lookAt = now;
    this.lookMorph = morph;
  }

  private lookAtTime(now: number): Look {
    const k = (now - this.lookAt) / this.lookMorph;
    if (k >= 1) return this.look;
    return lerpLook(this.lookPrev, this.look, easings.easeOutQuint(clamp(k)));
  }
  private posed(def: StateDef, t: number, shape: number[] | null, expr: BotExpression | null): Pose {
    let pose = def.pose(t);
    if (def.baseBody && shape) {
      // on garde la pose (rotation, decalage, squash) et on n'echange que le profil
      pose = { ...pose, sil: { ...pose.sil, radii: shape } };
    }
    if (def.baseFace && expr) {
      pose = { ...pose, gaze: expr.gaze, split: expr.split, eyes: expr.eyes };
    }
    return pose;
  }

  private decalageAtTime(
    now: number,
    state: StateId,
  ): {
    x: number;
    y: number;
  } {
    const surAxe = (
      debut: number,
      duree: number,
      a: {
        x: number;
        y: number;
      },
      b: {
        x: number;
        y: number;
      },
    ) => {
      if (a === b) return b;
      const k = (now - debut) / duree;
      if (k >= 1) return b;
      const t = easings.easeOutQuint(clamp(k));
      return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
    };
    // axe de l'expression, pour chacune des deux formes en presence
    const parForme = (radii: number[] | null) =>
      surAxe(
        this.exprAt,
        BotEngine.SHAPE_MORPH,
        decalageDesYeux(radii, state, this.exprPrev?.id ?? null),
        decalageDesYeux(radii, state, this.expr?.id ?? null),
      );
    // puis axe de la forme
    return surAxe(this.shapeAt, BotEngine.SHAPE_MORPH, parForme(this.shapePrev), parForme(this.shape));
  }
  get state(): StateId {
    return this.cur;
  }

  reset(id: StateId, now: number) {
    this.cur = id;
    this.prev = null;
    this.departFige = null;
    this.tCur = now;
    this.tPrev = now;
    this.blinkAt = -10;
  }

  private origine(now: number, shape: number[] | null, expr: BotExpression | null): Pose | null {
    if (this.departFige) return this.departFige;
    if (!this.prev) return null;
    const prevDef = STATE_BY_ID.get(this.prev)!;
    return this.posed(prevDef, Math.max(0, now - this.tPrev), shape, expr);
  }

  private poseComposee(now: number): Pose {
    const def = STATE_BY_ID.get(this.cur)!;
    const shape = this.shapeAtTime(now);
    const expr = this.exprAtTime(now);
    const pose = this.posed(def, Math.max(0, now - this.tCur), shape, expr);
    const since = now - this.tCur;
    if (since >= def.morph) return pose;
    const origine = this.origine(now, shape, expr);
    if (!origine) return pose;
    return blendPose(origine, pose, easings.easeOutQuint(clamp(since / def.morph)));
  }

  setState(id: StateId, now: number) {
    if (id === this.cur) return;
    const morph = STATE_BY_ID.get(this.cur)!.morph;
    const enPleinFondu = this.prev !== null && now - this.tCur < morph;
    this.departFige = enPleinFondu ? this.poseComposee(now) : null;
    this.prev = this.cur;
    this.tPrev = this.tCur;
    this.cur = id;
    this.tCur = now;
    // Dans la video, chaque changement de forme est masque par un clignement.
    if (STATE_BY_ID.get(id)?.blinkIn) this.blinkAt = now;
  }
  sample(now: number): BotFrame {
    const R = this.scale;
    const def = STATE_BY_ID.get(this.cur)!;
    const shape = this.shapeAtTime(now);
    const expr = this.exprAtTime(now);
    let pose = this.posed(def, Math.max(0, now - this.tCur), shape, expr);
    let decalage = this.decalageAtTime(now, this.cur);
    // --- transition -------------------------------------------------------
    const since = now - this.tCur;
    // L'etat precedent n'est jamais purge : `since < def.morph` suffit a
    // l'ignorer une fois le fondu passe, et l'oublier rendrait le moteur non
    // rejouable — relire une date d'avant la fin du fondu ne le retrouverait
    // plus. C'est l'optimisation qui parait innocente et qui casse tout.
    const origine = since < def.morph ? this.origine(now, shape, expr) : null;
    if (origine) {
      // Ease-out exponentiel : c'est la courbe mesuree sur la video. Le corps
      // n'a pas d'overshoot (seuls la pastille et l'ouverture des yeux en ont).
      // Le ratio est borne : relire une date ANTERIEURE au changement d'etat
      // donnerait un ratio negatif, que l'ease-out extrapole — la silhouette
      // part alors trente fois trop loin.
      const ratio = easings.easeOutQuint(clamp(since / def.morph));
      pose = blendPose(origine, pose, ratio);
      // Le decalage des yeux suit la MEME courbe que la silhouette qui le motive. Il vient
      // de l'etat quitte, que `setState` renseigne toujours en meme temps que l'origine —
      // le test est la pour le typage, pas pour un cas reel.
      const quitte = this.prev;
      if (quitte) {
        const avant = this.decalageAtTime(now, quitte);
        decalage = {
          x: lerp(avant.x, decalage.x, ratio),
          y: lerp(avant.y, decalage.y, ratio),
        };
      }
    }
    // --- vie au repos -----------------------------------------------------
    const alive = pose.eyeAlpha > 0.01;
    const look = this.lookAtTime(now);
    const life = liveliness(now, { wander: alive ? look.wander : 0, blink: alive });
    const gaze = {
      // Les deux visees REMPLACENT celles de la pose au lieu de s'y ajouter (voir
      // `Look`), et le tour se retranche en chemin. La derive s'ajoute APRES le
      // melange, sinon la cible l'annulerait en meme temps que la pose — or elle
      // doit survivre a une tete tournee sans pointeur.
      yaw: lerp(pose.gaze.yaw, look.yaw, look.mix) + life.dYaw - look.spin,
      pitch: lerp(pose.gaze.pitch, look.pitch, look.mix) + life.dPitch,
      // le roulis, lui, ne suit rien : la tete du bot est penchee de -13deg dans
      // la video, et la faire rouler avec le curseur casse cette signature
      roll: pose.gaze.roll + life.dRoll,
    };
    // clignement declenche par le changement d'etat, en plus du calendrier
    const forced = clamp((now - this.blinkAt) / 0.2);
    const forcedLid = forced < 1 ? Math.abs(forced * 2 - 1) : 1;
    const lid = Math.min(life.lid, forcedLid);
    const offX = pose.offX + life.driftX;
    const offY = pose.offY + life.driftY;
    // --- corps ------------------------------------------------------------
    const sil: Silhouette = {
      ...pose.sil,
      cx: pose.sil.cx + offX,
      cy: pose.sil.cy + offY,
      sy: pose.sil.sy * life.breath,
    };
    const bodyPath = closedPath(toPoints(sil, R, this.pts));
    // --- yeux -------------------------------------------------------------
    // Les yeux vivent sur une sphere de rayon 1 ; des que la silhouette n'est
    // plus un cercle, on les ramene au prorata du rayon reel dans leur
    // direction, sinon ils debordent et le masque les coupe.
    const bodyRadius = (x: number, y: number) => radiusAtAngle(pose.sil.radii, Math.atan2(y, x) - pose.sil.rot);
    const eyes: RenderedEye[] = [];
    if (pose.eyeAlpha > 0.01) {
      const poses = eyePoses(gaze, R, pose.split);
      for (let i = 0; i < 2; i++) {
        const e = poses[i]!;
        if (e.depth <= 0.02) continue;
        const cfg = pose.eyes[i]!;
        const fit = bodyRadius(e.x, e.y);
        // Inclinaison propre de l'oeil : on compose le repere tangent avec une
        // rotation dans le plan de l'oeil (Basis x Rot). C'est ce qui permet des
        // inclinaisons en miroir entre les deux yeux.
        const phi = ((cfg.tilt ?? 0) * Math.PI) / 180;
        const cp = Math.cos(phi);
        const sp = Math.sin(phi);
        const ax = e.a * cp + e.c * sp;
        const ay = e.b * cp + e.d * sp;
        const cx2 = -e.a * sp + e.c * cp;
        const cy2 = -e.b * sp + e.d * cp;
        // Le clignement s'applique APRES tout ca : c'est un ecrasement vertical
        // a l'ecran, pas le long de l'axe de la gelule.
        const k = blinkScale(Math.min(lid, cfg.open));
        eyes.push({
          d: eyeShapePath(
            cfg.w * R,
            cfg.h * R,
            this.eyeFrom,
            this.eyeStyle,
            easings.easeOutQuint(clamp((now - this.eyeAt) / BotEngine.SHAPE_MORPH)),
          ),
          matrix: `matrix(${r2(ax)},${r2(ay * k)},${r2(cx2)},${r2(cy2 * k)},${r2(e.x * fit + (offX + decalage.x) * R)},${r2(e.y * fit + (offY + decalage.y) * R)})`,
          alpha: pose.eyeAlpha * clamp(e.depth / 0.12),
        });
      }
    }
    // --- decor ------------------------------------------------------------
    const dots = pose.dots
      .filter((p) => p.opacity > 0.01 && p.r > 0.0005)
      .map((p) => ({ ...p, x: (p.x + offX) * R, y: (p.y + offY) * R, r: p.r * R }));
    // la pastille est posee sur le contour : elle suit donc la forme aussi
    const nFit = pose.notif ? bodyRadius(pose.notif.x, pose.notif.y) : 1;
    const nx = pose.notif ? (pose.notif.x * nFit + offX) * R : 0;
    const ny = pose.notif ? (pose.notif.y * nFit + offY) * R : 0;
    const notif = pose.notif ? { x: nx, y: ny, r: pose.notif.r * R } : null;
    const notch = pose.notif ? { x: nx, y: ny, r: pose.notif.notch * R } : null;
    return {
      bodyPath,
      bodyAlpha: pose.bodyAlpha,
      eyes,
      dots,
      dotsBehind: pose.dotsBehind,
      // Les etats declarent des arcs en unites de rayon de boule ; le moteur
      // est le seul a connaitre l'echelle du viewBox, donc c'est lui qui trace.
      arcs: pose.arcs.filter((a) => a.opacity > 0.01).map((a) => arcRender(a.seed, a.t, R, a.id, a.opacity)),
      notif,
      notch,
    };
  }
}
