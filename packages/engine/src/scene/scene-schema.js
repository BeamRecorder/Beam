// Portable JSON boundary shared by the TypeScript engine and Electron's project store.
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const identifier = (value) => typeof value === 'string' && value.length > 0 && value.length <= 600;
const fail = (message) => {
  throw new Error(`Invalid scene: ${message}`);
};
const forbidden = new Set([
  '__proto__',
  'prototype',
  'constructor',
  'id',
  'assetId',
  'kind',
  'children',
  'trackId',
  'timelineStartMs',
  'timelineDurationMs',
  'sourceInMs',
  'sourceDurationMs',
  'playbackRate',
  'timing',
]);

function easing(value) {
  if (value === undefined || ['linear', 'ease-in', 'ease-out', 'ease-in-out'].includes(value)) return;
  if (!value || typeof value !== 'object') fail('easing');
  if (
    Array.isArray(value.bezier) &&
    value.bezier.length === 4 &&
    value.bezier.every(finite) &&
    [value.bezier[0], value.bezier[2]].every((v) => v >= 0 && v <= 1)
  )
    return;
  if (
    Number.isInteger(value.steps) &&
    value.steps > 0 &&
    value.steps <= 10000 &&
    ['start', 'end'].includes(value.position)
  )
    return;
  if (
    value.spring &&
    finite(value.spring.damping) &&
    value.spring.damping > 0 &&
    value.spring.damping <= 100 &&
    finite(value.spring.frequency) &&
    value.spring.frequency > 0 &&
    value.spring.frequency <= 100
  )
    return;
  fail('easing');
}

function animationValue(kind, value) {
  if (kind === 'number') return finite(value);
  if (kind === 'color') return typeof value === 'string' && /^#[\da-f]{6}([\da-f]{2})?$/i.test(value);
  if (kind === 'vector') return Array.isArray(value) && value.length > 0 && value.length <= 64 && value.every(finite);
  if (kind === 'discrete')
    return finite(value) || typeof value === 'boolean' || (typeof value === 'string' && value.length <= 10000);
  return false;
}

export function validateSceneExtensions(composition) {
  if (composition.scene === undefined && composition.animations === undefined) return;
  const clips = new Map(composition.clips.map((clip) => [clip.id, clip]));
  const groups = new Map();
  const scene = composition.scene;
  if (scene !== undefined) {
    if (
      !scene ||
      scene.version !== 1 ||
      !Array.isArray(scene.roots) ||
      !Array.isArray(scene.groups) ||
      scene.groups.length > 10000
    )
      fail('graph schema');
    for (const group of scene.groups) {
      if (
        !group ||
        !identifier(group.id) ||
        clips.has(group.id) ||
        groups.has(group.id) ||
        !Array.isArray(group.children)
      )
        fail('group identity');
      if (
        !['scene', 'overlay'].includes(group.space) ||
        !finite(group.opacity) ||
        group.opacity < 0 ||
        group.opacity > 1 ||
        !['source-over', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'difference'].includes(group.blendMode)
      )
        fail('group appearance');
      if (
        !group.transform ||
        !['x', 'y', 'scaleX', 'scaleY', 'rotation'].every((key) => finite(group.transform[key])) ||
        group.transform.scaleX === 0 ||
        group.transform.scaleY === 0
      )
        fail('group transform');
      if (
        group.timing !== undefined &&
        (!group.timing ||
          !finite(group.timing.startMs) ||
          group.timing.startMs < 0 ||
          !finite(group.timing.rate) ||
          group.timing.rate < 0.25 ||
          group.timing.rate > 4)
      )
        fail('group timing');
      if (
        group.mask !== undefined &&
        (!group.mask ||
          !['rectangle', 'ellipse'].includes(group.mask.shape) ||
          !['x', 'y', 'width', 'height'].every((key) => finite(group.mask[key])) ||
          group.mask.width <= 0 ||
          group.mask.height <= 0)
      )
        fail('group mask');
      if (
        group.properties !== undefined &&
        (!group.properties ||
          typeof group.properties !== 'object' ||
          Array.isArray(group.properties) ||
          Object.keys(group.properties).length > 256 ||
          Object.entries(group.properties).some(
            ([key, value]) =>
              forbidden.has(key) ||
              !/^[a-zA-Z][\w]*$/.test(key) ||
              (!animationValue('discrete', value) && !animationValue('vector', value)),
          ))
      )
        fail('group properties');
      groups.set(group.id, group);
    }
    const visited = new Set();
    const visit = (id, space, depth) => {
      if (!identifier(id) || visited.has(id) || depth > 64) fail('cycle, duplicate parent or excessive depth');
      visited.add(id);
      const group = groups.get(id),
        clip = clips.get(id);
      if (!group && !clip) fail('missing child');
      if (group) {
        if (space && space !== group.space) fail('mixed paint spaces');
        for (const child of group.children) visit(child, group.space, depth + 1);
      } else if (space && clip.kind !== 'audio' && (clip.kind === 'caption' ? 'overlay' : 'scene') !== space)
        fail('mixed paint spaces');
    };
    for (const root of scene.roots) visit(root, null, 0);
    if ([...groups.keys()].some((id) => !visited.has(id))) fail('unreachable group');
  }
  const animations = composition.animations;
  if (animations === undefined) return;
  if (!animations || animations.version !== 1 || !Array.isArray(animations.tracks) || animations.tracks.length > 10000)
    fail('animation schema');
  const trackIds = new Set(),
    properties = new Set();
  for (const track of animations.tracks) {
    if (
      !track ||
      !identifier(track.id) ||
      trackIds.has(track.id) ||
      !identifier(track.targetId) ||
      typeof track.property !== 'string'
    )
      fail('track identity');
    const target = groups.get(track.targetId) ?? clips.get(track.targetId);
    if (track.timeOffsetMs !== undefined && !finite(track.timeOffsetMs)) fail('animation offset');
    if (
      !target ||
      !['number', 'color', 'vector', 'discrete'].includes(track.interpolation) ||
      (track.timeSpace !== undefined && !['timeline', 'local'].includes(track.timeSpace))
    )
      fail('animation target');
    const path = track.property.split('.');
    if (path.length > 8 || path.some((key) => !/^[a-zA-Z][\w]*$/.test(key) || forbidden.has(key)))
      fail('animation property');
    let authored = target;
    for (const key of path) {
      if (!authored || typeof authored !== 'object' || !Object.hasOwn(authored, key)) fail('unknown property');
      authored = authored[key];
    }
    if (!animationValue(track.interpolation, authored)) fail('property type');
    const propertyId = JSON.stringify([track.targetId, track.property]);
    if (properties.has(propertyId)) fail('duplicate property track');
    properties.add(propertyId);
    trackIds.add(track.id);
    if (!Array.isArray(track.keyframes) || !track.keyframes.length || track.keyframes.length > 100000)
      fail('keyframes');
    let previous = -Infinity;
    for (const frame of track.keyframes) {
      if (
        !frame ||
        !finite(frame.timeMs) ||
        frame.timeMs < 0 ||
        frame.timeMs <= previous ||
        !animationValue(track.interpolation, frame.value)
      )
        fail('keyframe value or time');
      if (track.interpolation === 'vector' && frame.value.length !== authored.length) fail('vector dimensions');
      if (track.interpolation === 'discrete' && typeof frame.value !== typeof authored) fail('discrete property type');
      easing(frame.easing);
      previous = frame.timeMs;
    }
  }
}
