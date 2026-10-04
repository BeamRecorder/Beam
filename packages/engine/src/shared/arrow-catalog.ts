import type { ArrowDefinition, ArrowPreset } from './shape-vector-types';

export const ARROW_CATALOG: readonly ArrowDefinition[] = [
  { id: 'solid', path: 'M0 .407H.738V.08L1 .5L.738 .92V.593H0Z', aspectRatio: 3.6, end: 'none' },
  { id: 'line', path: 'M.08 .5L.9 .5', aspectRatio: 3.6 },
  { id: 'double', path: 'M.1 .5L.9 .5', aspectRatio: 3.6, start: 'triangle' },
  { id: 'curved', path: 'M.08 .82C.2 .1 .62 .02 .9 .45', aspectRatio: 1.4 },
  { id: 'elbow', path: 'M.08 .85H.5V.2H.9', aspectRatio: 1.4 },
  { id: 'open', path: 'M.08 .5L.9 .5', aspectRatio: 3.6, end: 'open' },
  { id: 'round-start', path: 'M.1 .5L.9 .5', aspectRatio: 3.6, start: 'circle' },
  { id: 'round-head', path: 'M.08 .5L.9 .5', aspectRatio: 3.6, end: 'circle' },
  { id: 'open-double', path: 'M.1 .5L.9 .5', aspectRatio: 3.6, start: 'open', end: 'open' },
  { id: 'filled-left', path: 'M1 .4H.28V.08L0 .5L.28 .92V.6H1Z', aspectRatio: 3.6, end: 'none' },
  { id: 'filled-up', path: 'M.4 1V.28H.08L.5 0L.92 .28H.6V1Z', aspectRatio: 0.6, end: 'none' },
  { id: 'filled-down', path: 'M.4 0V.72H.08L.5 1L.92 .72H.6V0Z', aspectRatio: 0.6, end: 'none' },
  { id: 'filled-double', path: 'M0 .5L.25 .08V.4H.75V.08L1 .5L.75 .92V.6H.25V.92Z', aspectRatio: 3.6, end: 'none' },
  { id: 'chevron', path: 'M.1 .05H.45L.9 .5L.45 .95H.1L.55 .5Z', aspectRatio: 1.2, end: 'none' },
  { id: 'notched', path: 'M0 .28H.65V.06L1 .5L.65 .94V.72H0L.18 .5Z', aspectRatio: 2.7, end: 'none' },
  { id: 'wide', path: 'M0 .25H.65V.02L1 .5L.65 .98V.75H0Z', aspectRatio: 2.7, end: 'none' },
  { id: 'slender', path: 'M0 .46H.82V.18L1 .5L.82 .82V.54H0Z', aspectRatio: 4, end: 'none' },
  { id: 'bent-filled', path: 'M.06 .95V.3H.65V.06L1 .4L.65 .74V.5H.26V.95Z', aspectRatio: 1.4, end: 'none' },
  { id: 'arc', path: 'M.08 .8Q.5 -.25 .92 .8', aspectRatio: 1.4 },
  { id: 'reverse-curve', path: 'M.08 .2C.2 .9 .62 .98 .9 .55', aspectRatio: 1.4 },
  { id: 's-curve', path: 'M.08 .85C.85 .85 .15 .15 .92 .15', aspectRatio: 1.4 },
  { id: 'wave', path: 'M.06 .55C.2 -.1 .35 1.1 .5 .55S.8 -.1 .94 .55', aspectRatio: 2.3 },
  { id: 'hook', path: 'M.12 .9V.4C.12 -.02 .88 -.02 .88 .4V.7', aspectRatio: 1.2 },
  { id: 'u-turn', path: 'M.12 .9V.38Q.12 .08 .4 .08H.6Q.88 .08 .88 .38V.82', aspectRatio: 1.2 },
  { id: 'zigzag', path: 'M.08 .9L.3 .1L.58 .9L.9 .1', aspectRatio: 1.4 },
  {
    id: 'loop',
    path: 'M.08 .85C.2 .75 .75 .72 .75 .38C.75 -.08 .15 -.08 .15 .38C.15 .75 .65 .72 .92 .12',
    aspectRatio: 1.2,
  },
  { id: 'elbow-double', path: 'M.08 .85H.5V.2H.9', aspectRatio: 1.4, start: 'triangle' },
  { id: 'arc-double', path: 'M.08 .8Q.5 -.25 .92 .8', aspectRatio: 1.4, start: 'triangle' },
  {
    id: 'filled-curved',
    path: 'M.05 .88C.15 .25 .44 .12 .7 .28L.75 .06L.98 .58L.43 .58L.6 .42C.4 .3 .2 .53 .18 .9Z',
    aspectRatio: 1.4,
    end: 'none',
  },
  {
    id: 'swoosh',
    path: 'M.02 .88Q.45 .8 .65 .35L.44 .32L.94 .05L.93 .65L.78 .47Q.5 .95 .02 .88Z',
    aspectRatio: 1.8,
    end: 'none',
  },
];

export function arrowDefinition(id: ArrowPreset): ArrowDefinition {
  const definition = ARROW_CATALOG.find((entry) => entry.id === id);
  if (!definition) throw new TypeError('Unknown arrow preset.');
  return definition;
}
