export const scenes = [
  ['intro', 0, 2.367],
  ['one-prompt', 2.367, 5],
  ['meet', 5, 5.733],
  ['brand-intro', 5.733, 8.533],
  ['build-title', 8.533, 11],
  ['build-prompt', 11, 13],
  ['app-built', 13, 15.867],
  ['agent-chat', 15.867, 19.933],
  ['agents-title', 19.933, 22.467],
  ['agents-list', 22.467, 24.133],
  ['agents-result', 24.133, 25.133],
  ['pipeline', 25.133, 26.8],
  ['charts', 26.8, 28.333],
  ['simple', 28.333, 30.4],
  ['powerful', 30.4, 32.867],
  ['connect', 32.867, 37.233],
  ['chaos', 37.233, 39.433],
  ['files', 39.433, 42.167],
  ['file-list', 42.167, 42.733],
  ['connections', 42.733, 43.933],
  ['ask-title', 43.933, 46.4],
  ['question', 46.4, 48.267],
  ['answer', 48.267, 52.6],
  ['sources', 52.6, 55],
  ['works', 55, 58.6],
  ['system', 58.6, 65.4],
  ['end', 65.4, 68.6],
];

export function sceneAt(time) {
  return scenes.find(([, start, end]) => time >= start && time < end)?.[0] ?? (time >= 68.6 ? 'end' : null);
}

export function placeScenes(timeline) {
  for (const [id, start, end] of scenes) {
    timeline.addLabel(id, start);
  }
}

export function createSceneRenderer(root) {
  const elements = scenes.map(([id, start, end]) => {
    const element = root.querySelector('#' + id);
    if (!element) throw new Error('Missing reference scene: ' + id);
    element.dataset.start = String(start);
    element.dataset.duration = String(end - start);
    return { id, element };
  });
  let current;
  return (time) => {
    const selected = sceneAt(time);
    if (selected === current) return;
    for (const { id, element } of elements) {
      // A child animated with autoAlpha can override inherited visibility.
      element.hidden = id !== selected;
      element.style.visibility = id === selected ? 'visible' : 'hidden';
    }
    current = selected;
  };
}
