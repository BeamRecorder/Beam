import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compositionTime, createTextRenderer, textAt } from '../src/clock.js';
import { createSceneRenderer, placeScenes, sceneAt, scenes } from '../src/choreography.js';

test('Beam milliseconds map to bounded seconds without accepting non-finite clocks', () => {
  assert.equal(compositionTime(15300), 15.3);
  assert.equal(compositionTime(-1), 0);
  assert.equal(compositionTime(99000), 68.6);
  for (const value of [NaN, Infinity, -Infinity]) assert.throws(() => compositionTime(value), /finite/);
});
test('typing reconstructs arbitrary forward and reverse positions', () => {
  assert.equal(textAt(0, 1, 1, 'Zaro'), '');
  assert.equal(textAt(1.5, 1, 1, 'Zaro'), 'Za');
  assert.equal(textAt(2, 1, 1, 'Zaro'), 'Zaro');
  assert.equal(textAt(1, 1, 1, 'Zaro'), '');
});
test('scene boundaries preserve the entire reference without gaps or overlaps', () => {
  assert.equal(sceneAt(-1), null);
  assert.equal(sceneAt(0), 'intro');
  assert.equal(sceneAt(68.6), 'end');
  for (let index = 1; index < scenes.length; index++) {
    assert.equal(scenes[index][1], scenes[index - 1][2]);
    assert.equal(sceneAt(scenes[index][1]), scenes[index][0]);
  }
  assert.equal(scenes.at(-1)[2], 68.6);
});
test('text renderer restores earlier phrases after seeking from the tools reveal', () => {
  const elements = new Map();
  const root = {
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, { textContent: '' });
      return elements.get(selector);
    },
  };
  const render = createTextRenderer(root);
  render(36.5);
  assert.equal(elements.get('#connect .typed').textContent, 'Connect your tools.');
  render(34.3);
  assert.equal(elements.get('#connect .typed').textContent, 'Connect your mess.');
  render(35.3);
  assert.equal(elements.get('#connect .typed').textContent, 'Connect your files.');
  render(0);
  assert.equal(elements.get('#connect .typed').textContent, '');
  assert.throws(
    () =>
      createTextRenderer({
        querySelector() {
          return null;
        },
      }),
    /Missing typed/,
  );
});

function sceneFixture() {
  const elements = new Map(scenes.map(([id]) => [id, { dataset: {}, style: { visibility: 'hidden' } }]));
  const render = createSceneRenderer({
    querySelector(selector) {
      return elements.get(selector.slice(1));
    },
  });
  return {
    elements,
    render,
    visible: () => [...elements].filter(([, element]) => element.style.visibility === 'visible').map(([id]) => id),
  };
}

test('scene renderer restores earlier scenes after a reverse seek across the ending', () => {
  const fixture = sceneFixture();
  for (const [time, expected] of [
    [68.6, 'end'],
    [0, 'intro'],
    [24.2, 'agents-result'],
    [9, 'build-title'],
  ]) {
    fixture.render(time);
    assert.deepEqual(fixture.visible(), [expected]);
  }
});

test('scene renderer stamps timing metadata and keeps repeated seeks stable', () => {
  const fixture = sceneFixture();
  fixture.render(43);
  fixture.render(43.1);
  assert.deepEqual(fixture.visible(), ['connections']);
  for (const [id, element] of fixture.elements) assert.equal(element.hidden, id !== 'connections');
  for (const [id, start, end] of scenes) {
    assert.equal(fixture.elements.get(id).dataset.start, String(start));
    assert.equal(fixture.elements.get(id).dataset.duration, String(end - start));
  }
});

test('scene renderer fails on incomplete layouts and hides scenes before the reference starts', () => {
  assert.throws(
    () =>
      createSceneRenderer({
        querySelector() {
          return null;
        },
      }),
    /Missing reference scene: intro/,
  );
  const fixture = sceneFixture();
  fixture.render(0);
  fixture.render(-1);
  assert.deepEqual(fixture.visible(), []);
});

test('GSAP labels use the same reference boundaries as the scene clock', () => {
  const labels = [];
  placeScenes({
    addLabel(id, time) {
      labels.push([id, time]);
    },
  });
  assert.deepEqual(
    labels,
    scenes.map(([id, start]) => [id, start]),
  );
});
