// Requested stress proof: copied real media, four source-time phases, independently editable layers.
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const [sourceArgument, targetArgument] = process.argv.slice(2);
if (!sourceArgument || !targetArgument) throw new Error('Usage: SOURCE NEW_TARGET');
const source = path.resolve(sourceArgument),
  target = path.resolve(targetArgument);
if (existsSync(target) || target === source || target.startsWith(source + path.sep))
  throw new Error('Use a fresh destination outside the source.');
const original = readFileSync(path.join(source, 'project.json'), 'utf8');
const manifest = JSON.parse(original.split(source).join(target));
const composition = manifest.editor.composition;
const find = (kind) => composition.clips.find((c) => c.kind === kind);
const screen = find('screen'),
  video = find('video'),
  shape = find('shape'),
  blur = find('blur');
const screenAsset = composition.assets.find((a) => a.id === screen?.assetId),
  videoAsset = composition.assets.find((a) => a.id === video?.assetId);
if (
  !screen ||
  !video ||
  !shape ||
  !blur ||
  !screenAsset ||
  !videoAsset ||
  ![screenAsset.durationMs, videoAsset.durationMs].every((d) => Number.isFinite(d) && d >= 1000)
)
  throw new Error('Source requires screen/video media of at least one second, a shape and an effect.');
let seed = 7458;
const random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};
const clips = [];
const repeat = (template, asset, order, phase, transform, appearance) => {
  const trackId = randomUUID();
  let time = 0,
    sourceIn = Math.floor(asset.durationMs * phase);
  while (time < 60000) {
    const duration = Math.min(Math.floor(asset.durationMs) - sourceIn, 60000 - time);
    if (duration < 40) throw new Error('Fixture would contain a sub-frame media fragment.');
    clips.push({
      ...template,
      id: randomUUID(),
      trackId,
      enabled: true,
      groupId: undefined,
      recordingClipId: null,
      order,
      timelineStartMs: time,
      timelineDurationMs: duration,
      sourceInMs: sourceIn,
      sourceDurationMs: duration,
      playbackRate: 1,
      freezeFrameSourceMs: undefined,
      transform,
      appearance,
      transitions: { entry: null, exit: null },
    });
    time += duration;
    sourceIn = 0;
  }
};
repeat(screen, screenAsset, 256, 0, screen.transform, screen.appearance);
for (let i = 0; i < 64; i++) {
  const size = 0.12 + random() * 0.06;
  repeat(
    video,
    videoAsset,
    192 + i,
    (i % 4) / 8,
    { x: random() * (1 - size), y: random() * (1 - size), width: size, height: size },
    { ...video.appearance, shadowMode: i % 2 ? 'adaptive' : 'solid' },
  );
}
for (let i = 0; i < 128; i++) {
  const size = 0.03 + random() * 0.04;
  clips.push({
    ...shape,
    id: randomUUID(),
    trackId: randomUUID(),
    enabled: true,
    order: 64 + i,
    groupId: undefined,
    recordingClipId: null,
    name: `Stress shape ${i + 1}`,
    timelineStartMs: 0,
    timelineDurationMs: 60000,
    sourceInMs: 0,
    sourceDurationMs: 60000,
    playbackRate: 1,
    transform: { x: random() * (1 - size), y: random() * (1 - size), width: size, height: size },
    preset: ['rectangle', 'heart', 'star', 'speech-bubble'][i % 4],
    rotation: (i % 4) * 15,
    opacityEnabled: false,
    shadowEnabled: true,
    shadowBlur: 12,
    transitions: { entry: null, exit: null },
  });
}
for (let i = 0; i < 64; i++) {
  const size = 0.04 + random() * 0.035;
  clips.push({
    ...blur,
    id: randomUUID(),
    trackId: randomUUID(),
    enabled: true,
    order: i,
    groupId: undefined,
    recordingClipId: null,
    name: `Stress effect ${i + 1}`,
    timelineStartMs: 0,
    timelineDurationMs: 60000,
    sourceInMs: 0,
    sourceDurationMs: 60000,
    playbackRate: 1,
    transform: { x: random() * (1 - size), y: random() * (1 - size), width: size, height: size },
    mode: i % 4 === 0 ? 'frosted' : 'blur',
    transitions: { entry: null, exit: null },
  });
}
composition.clips = clips;
composition.assets = [screenAsset, videoAsset];
composition.keyboardCaptionSessions = [];
manifest.projectId = randomUUID();
manifest.name = 'Beam Stress — mixed GPU — 64 videos + 128 shapes + 64 effects — 60s';
manifest.createdAtUtc = manifest.updatedAtUtc = new Date().toISOString();
manifest.editor.zoom = {
  ...manifest.editor.zoom,
  elements: [],
  generatedSessions: [],
  motionBlur: { enabled: false, intensity: 0.55 },
};
const session = manifest.sessions.find((s) => s.sessionId === screenAsset.sessionId);
if (session && screenAsset.sessionPath)
  manifest.previewSrc = pathToFileURL(path.join(target, session.relativePath, screenAsset.sessionPath)).href;
cpSync(source, target, { recursive: true, dereference: true });
writeFileSync(path.join(target, 'project.json'), JSON.stringify(manifest));
if (
  createHash('sha256')
    .update(readFileSync(path.join(source, 'project.json')))
    .digest('hex') !== createHash('sha256').update(original).digest('hex')
)
  throw new Error('Source changed during fixture creation.');
console.log(
  JSON.stringify({
    target,
    id: manifest.projectId,
    seed: 7458,
    videos: 64,
    shapes: 128,
    effects: 64,
    durationMs: 60000,
  }),
);
