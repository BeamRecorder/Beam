import type { DotRender, ArcRender, ArcSeed } from './bot-types';
import { TAU, clamp, createRng, r2 } from './math';

function wheel(hue: number, s = 0.55, l = 0.62): string {
  const h = ((hue % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  const hex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

export function arcRender(seed: ArcSeed, t: number, scale: number, id: string, opacity = 1): ArcRender {
  const spin = seed.phase + t * seed.speed * TAU;
  const cu = Math.cos(seed.tilt);
  const su = Math.sin(seed.tilt);
  const kz = Math.sqrt(Math.max(0, 1 - seed.k * seed.k));
  const N = 64;
  const span = seed.sweep * TAU;
  let front = '';
  let back = '';
  let prev: boolean | null = null;
  for (let i = 0; i <= N; i++) {
    const th = spin + (i / N) * span;
    const ct = Math.cos(th);
    const st = Math.sin(th);
    // u = (cos tilt, sin tilt, 0) ; v = (-sin tilt * k, cos tilt * k, kz)
    const x = seed.a * (ct * cu + st * -su * seed.k) + seed.cx;
    const y = seed.a * (ct * su + st * cu * seed.k) + seed.cy;
    const z = seed.a * st * kz;
    const behind = z < 0;
    const sx = r2(x * scale);
    const sy = r2(y * scale);
    const cmd = behind !== prev ? 'M' : 'L';
    if (behind) back += `${cmd}${sx} ${sy}`;
    else front += `${cmd}${sx} ${sy}`;
    prev = behind;
  }
  const gx = Math.cos(seed.tilt) * seed.a * scale;
  const gy = Math.sin(seed.tilt) * seed.a * scale;
  return {
    id,
    front,
    back,
    width: seed.width * scale,
    opacity,
    grad: {
      x1: r2(seed.cx * scale - gx),
      y1: r2(seed.cy * scale - gy),
      x2: r2(seed.cx * scale + gx),
      y2: r2(seed.cy * scale + gy),
      stops: [wheel(seed.hue), wheel(seed.hue + seed.hueSpan * 0.5), wheel(seed.hue + seed.hueSpan)],
    },
  };
}

const RING_RNG = createRng(0xa11ce);

export const RINGS: ArcSeed[] = Array.from({ length: 6 }, (_, i) => ({
  a: 1.3 + RING_RNG() * 0.1,
  k: 0.05 + RING_RNG() * 0.4,
  tilt: (i / 6) * Math.PI + RING_RNG() * 0.5,
  speed: 3 + RING_RNG() * 0.7,
  phase: RING_RNG() * TAU,
  sweep: 0.6 + RING_RNG() * 0.25,
  hue: (i * 360) / 6 + RING_RNG() * 30,
  hueSpan: 60 + RING_RNG() * 60,
  width: 0.05 + RING_RNG() * 0.012,
  cx: 0,
  cy: 0.1,
}));

export const SWOOSH: ArcSeed[] = Array.from({ length: 4 }, (_, i) => ({
  a: 0.78 + i * 0.2,
  k: 0.05 + i * 0.02,
  tilt: -0.62 + i * 0.05,
  speed: 0.3,
  phase: 0.06 * i,
  sweep: 0.4,
  hue: 95 + i * 62,
  hueSpan: 100,
  width: 0.05,
  cx: 0,
  cy: -0.12,
}));

export const DOT_X = [-0.557, -0.013, 0.532] as const;
export const DOT_R = 0.165;
export const DOT_PEAK = 1.25;

const P_RNG = createRng(0xbeef);

const PARTICLES = Array.from({ length: 5 }, (_, i) => ({
  birth: i * 0.2,
  angle: P_RNG() * TAU,
  rho: 0.58 + P_RNG() * 0.18,
}));

export function particles(t: number, scale: number): DotRender[] {
  const out: DotRender[] = [];
  for (const p of PARTICLES) {
    const u = t - p.birth;
    if (u < 0 || u > 0.62) continue;
    const rho = p.rho * Math.pow(0.75, u * 10);
    const a = p.angle + (u * 100 * Math.PI) / 180;
    out.push({
      x: Math.cos(a) * rho * scale,
      y: Math.sin(a) * rho * scale,
      r: (0.04 + 0.028 * clamp(u / 0.55)) * scale,
      depth: clamp(1 - rho / 0.8),
      opacity: clamp(u / 0.06) * clamp((0.62 - u) / 0.08),
    });
  }
  return out;
}

const COMET_RNG = createRng(0xc0e7);
export const COMET_RIBBONS: ArcSeed[] = Array.from({ length: 4 }, (_, i) => {
  const d = i - 1.5;
  return {
    a: 0.85 * (1 + d * 0.03),
    // meme aplatissement a +-5 % pres : les rubans forment un faisceau serre
    k: (0.15 / 0.85) * (1 + d * 0.16),
    tilt: (34 * Math.PI) / 180 + d * 0.035,
    speed: 210 / 360,
    // dephasage mesure : 10 a 20 degres entre rubans, pas davantage
    phase: -i * 0.045 + COMET_RNG() * 0.012,
    sweep: 0.34,
    hue: i * 85 + COMET_RNG() * 20,
    hueSpan: 80,
    width: 0.095,
    cx: 0,
    cy: 0,
  };
});

export const COMET_DOT = 0.129;

export const NOTIF_BLUE = '#2496e8';

export const NOTIF_ANGLE = -42;
export const NOTIF_DIST = 1.003;

export const NOTIF_R = 0.15;
export const NOTIF_POP = 1.14;

export const NOTIF_MARGIN = 0.054;
