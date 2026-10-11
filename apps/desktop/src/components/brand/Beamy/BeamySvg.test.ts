import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, expect, it } from 'vitest';
import { defineComponent, h } from 'vue';
import BeamySvg from './BeamySvg.vue';
import type { BotFrame } from './engine/bot-types';

enableAutoUnmount(afterEach);
const frame: BotFrame = {
  bodyPath: 'M0 0L10 0L0 10Z',
  bodyAlpha: 1,
  eyes: [{ d: 'M1 1L2 2', matrix: 'translate(1 2)', alpha: 0.8 }],
  dots: [],
  dotsBehind: false,
  arcs: [],
  notif: null,
  notch: null,
};

it('scopes face masks per mascot and preserves green color changes without changing its shape', async () => {
  const host = mount(
    defineComponent({
      render: () =>
        h('div', [
          h(BeamySvg, { frame, color: '#ef6c30' }),
          h(BeamySvg, { frame, color: '#ef6c30', portrait: true, size: 52 }),
        ]),
    }),
  );
  const [first, second] = host.findAllComponents(BeamySvg);
  expect(first).toBeDefined();
  expect(second).toBeDefined();
  const mask = first!.get('mask').attributes('id');
  expect(mask).not.toBe(second!.get('mask').attributes('id'));
  expect(first!.get('path.mascot-fill').attributes('mask')).toBe(`url(#${mask})`);
  expect(second!.get('svg').attributes('viewBox')).toBe('-116 -116 232 232');
  expect(second!.get('svg').attributes('width')).toBe('52');
  const changing = mount(BeamySvg, { props: { frame, color: '#ef6c30' } });
  await changing.setProps({ color: '#53b97d' });
  expect(changing.get('path.mascot-fill').attributes('fill')).toBe('#53b97d');
  expect(changing.get('path.mascot-fill').attributes('d')).toBe(frame.bodyPath);
  expect(changing.get('mask path[fill="black"]').attributes('opacity')).toBe('0.8');
});

it.each([true, false])('keeps decorative particles on their intended side of the body (%s)', (dotsBehind) => {
  const wrapper = mount(BeamySvg, {
    props: {
      color: '#000000',
      paper: '#ffffff',
      frame: {
        ...frame,
        dotsBehind,
        dots: [
          { x: 1, y: 2, r: 3, opacity: 0.4 },
          { x: 4, y: 5, r: 6, opacity: 0.5, depth: 0.5 },
          { x: 7, y: 8, r: 9, opacity: 0.6, color: '#22aa66' },
          { x: 10, y: 11, r: 1, opacity: 0.7, d: 'M0 0L1 1', rot: 30 },
          { x: 12, y: 13, r: 1, opacity: 0.8, d: 'M0 0L1 1' },
        ],
      },
    },
  });
  const circles = wrapper.findAll('circle.mascot-fill');
  expect(circles.map((circle) => circle.attributes('fill'))).toEqual(['#000000', '#808080', '#22aa66']);
  expect(circles[0]!.attributes()).toMatchObject({ cx: '1', cy: '2', r: '3', opacity: '0.4' });
  const paths = wrapper.findAll('path.mascot-fill').filter((path) => !path.attributes('mask'));
  expect(paths[0]!.attributes('transform')).toContain('translate(10 11) rotate(30)');
  expect(paths[1]!.attributes('transform')).toContain('rotate(0)');
  const body = wrapper.get('path[mask]').element;
  const relation = circles[0]!.element.compareDocumentPosition(body);
  expect(Boolean(relation & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(dotsBehind);
});

it('preserves notification cutouts, blush, custom eyes and orbit gradients for other mascot callers', () => {
  const wrapper = mount(BeamySvg, {
    props: {
      color: '#ef6c30',
      eyeColor: '#102030',
      blush: true,
      frame: {
        ...frame,
        notch: { x: 1, y: 2, r: 3 },
        notif: { x: 4, y: 5, r: 6 },
        arcs: [
          {
            id: 'orbit',
            front: 'M0 0L1 1',
            back: 'M2 2L3 3',
            width: 4,
            opacity: 0.5,
            grad: { x1: 0, y1: 1, x2: 2, y2: 3, stops: ['#ffffff', '#000000'] },
          },
        ],
      },
    },
  });
  expect(wrapper.get('mask circle').attributes()).toMatchObject({ cx: '1', cy: '2', r: '3', fill: 'black' });
  expect(wrapper.get('ellipse').attributes('opacity')).toBe(String(0.8 * 0.22));
  expect(wrapper.get('g[fill="#102030"] path').attributes('d')).toBe(frame.eyes[0]!.d);
  const gradient = wrapper.get('linearGradient');
  expect(gradient.findAll('stop').map((stop) => stop.attributes('offset'))).toEqual(['0', '1']);
  const arcPaths = wrapper.findAll('path[stroke]');
  expect(arcPaths).toHaveLength(2);
  expect(arcPaths[0]!.attributes('stroke')).toBe(`url(#${gradient.attributes('id')})`);
  expect(arcPaths[1]!.attributes()).toMatchObject({ d: 'M0 0L1 1', 'stroke-width': '4', opacity: '0.5' });
});
