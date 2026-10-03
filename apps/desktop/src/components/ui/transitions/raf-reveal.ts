import type { RevealAxis, RevealProperty, RevealRuntime, RevealState } from './raf-reveal-types';

const pixels = (value: string) => Number.parseFloat(value) || 0;

export function createRafReveal(runtime: RevealRuntime, axis: RevealAxis = 'vertical') {
  const horizontal = axis === 'horizontal';
  const dimension = horizontal ? 'width' : 'height';
  const minimum = horizontal ? 'minWidth' : 'minHeight';
  const endMargin = horizontal ? 'marginRight' : 'marginBottom';
  const properties: RevealProperty[] = horizontal
    ? [
        'width',
        'paddingLeft',
        'paddingRight',
        'marginLeft',
        'marginRight',
        'borderLeftWidth',
        'borderRightWidth',
        'opacity',
      ]
    : [
        'height',
        'paddingTop',
        'paddingBottom',
        'marginTop',
        'marginBottom',
        'borderTopWidth',
        'borderBottomWidth',
        'opacity',
      ];
  const savedProperties = [...properties, 'overflow', minimum, 'boxSizing', 'willChange'] as const;
  const states = new Map<HTMLElement, RevealState>();
  let interruptedStart: Record<RevealProperty, number> | null = null;
  const cancel = (element: Element) => {
    const state = states.get(element as HTMLElement);
    if (state?.frame !== null && state?.frame !== undefined) runtime.cancelFrame(state.frame);
    if (state) state.frame = null;
  };
  const restore = (element: HTMLElement, state: RevealState) => {
    for (const property of savedProperties) element.style[property] = state.original[property]!;
    states.delete(element);
  };
  const measure = (element: HTMLElement): RevealState => {
    const style = getComputedStyle(element);
    const parent = element.parentElement ? getComputedStyle(element.parentElement) : null;
    const gap =
      parent &&
      (parent.display === 'grid' ||
        (parent.display === 'flex' && parent.flexDirection.startsWith(horizontal ? 'row' : 'column')))
        ? pixels(horizontal ? parent.columnGap : parent.rowGap)
        : 0;
    return {
      frame: null,
      original: Object.fromEntries(savedProperties.map((property) => [property, element.style[property]])),
      target: Object.fromEntries(
        properties.map((property) => [
          property,
          property === dimension
            ? element.getBoundingClientRect()[dimension]
            : property === 'opacity'
              ? 1
              : pixels(style[property]),
        ]),
      ) as Record<RevealProperty, number>,
      gap,
    };
  };
  const run = (element: Element, opening: boolean, done: () => void) => {
    const node = element as HTMLElement;
    const previous = states.get(node);
    cancel(node);
    const state = previous ?? measure(node);
    states.set(node, state);
    const current = getComputedStyle(node);
    const closed = {
      ...Object.fromEntries(properties.map((property) => [property, 0])),
      [endMargin]: -state.gap,
    } as Record<RevealProperty, number>;
    const start =
      opening && interruptedStart
        ? interruptedStart
        : previous || !opening
          ? (Object.fromEntries(
              properties.map((property) => [
                property,
                property === dimension ? node.getBoundingClientRect()[dimension] : pixels(current[property]),
              ]),
            ) as Record<RevealProperty, number>)
          : closed;
    interruptedStart = null;
    const target = opening ? state.target : closed;
    const finish = () => {
      restore(node, state);
      done();
    };
    if (runtime.reducedMotion()) {
      finish();
      return;
    }
    Object.assign(node.style, {
      overflow: 'hidden',
      [minimum]: '0',
      boxSizing: 'border-box',
      willChange: `${dimension}, opacity`,
    });
    const paint = (progress: number) => {
      const eased = progress * progress * (3 - 2 * progress);
      for (const property of properties) {
        const value = start[property] + (target[property] - start[property]) * eased;
        node.style[property] = property === 'opacity' ? String(value) : `${value}px`;
      }
    };
    paint(0);
    const began = runtime.now();
    const frame = (time: number) => {
      const progress = Math.min(1, Math.max(0, (time - began) / 200));
      if (progress === 1 || runtime.reducedMotion()) {
        finish();
        return;
      }
      paint(progress);
      state.frame = runtime.requestFrame(frame);
    };
    state.frame = runtime.requestFrame(frame);
  };
  const dispose = () => {
    for (const [element, state] of states) {
      cancel(element);
      restore(element, state);
    }
    interruptedStart = null;
  };
  return {
    enter: (element: Element, done: () => void) => run(element, true, done),
    leave: (element: Element, done: () => void) => run(element, false, done),
    afterLeave: (element: Element) => {
      const node = element as HTMLElement;
      const state = states.get(node);
      if (!state) return;
      // Vue can remove a leaving v-if node before its RAF finishes when the
      // same panel reopens. Continue on the replacement without a size jump.
      interruptedStart = Object.fromEntries(
        properties.map((property) => [property, pixels(node.style[property])]),
      ) as Record<RevealProperty, number>;
      cancel(node);
      restore(node, state);
    },
    cancel,
    dispose,
  };
}
