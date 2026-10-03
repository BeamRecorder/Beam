// Explicitly requested stress projects: real media, deterministic timing, independent project IDs.
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [sourceArgument, targetArgument, countArgument = '10000', mode = 'random'] = process.argv.slice(2);
if (!sourceArgument || !targetArgument || !['random', 'simultaneous'].includes(mode))
  throw new Error('Usage: create-timeline-stress.mjs SOURCE NEW_TARGET [count] [random|simultaneous]');
const source = path.resolve(sourceArgument);
const target = path.resolve(targetArgument);
const count = Number(countArgument);
if (
  existsSync(target) ||
  source === target ||
  target.startsWith(source + path.sep) ||
  !Number.isSafeInteger(count) ||
  count < 1 ||
  count > 10000
)
  throw new Error('Use a fresh destination and 1–10000 effects.');
const originalText = readFileSync(path.join(source, 'project.json'), 'utf8');
const manifest = JSON.parse(originalText.split(source).join(target));
const composition = manifest.editor.composition;
const screen = composition.clips.find((clip) => clip.kind === 'screen');
const blur = composition.clips.find((clip) => clip.kind === 'blur' && clip.mode === 'blur');
const asset = composition.assets.find((item) => item.id === screen?.assetId);
if (!screen || !blur || !asset || !Number.isFinite(asset.durationMs) || asset.durationMs < 40)
  throw new Error('Source needs a real screen recording and blur.');
const clips = [];
let start = 0;
while (start < 60000) {
  const duration = Math.min(Math.floor(asset.durationMs), 60000 - start);
  if (duration < 40) throw new Error('Last recording fragment is too short.');
  clips.push({
    ...screen,
    id: randomUUID(),
    enabled: true,
    groupId: undefined,
    recordingClipId: null,
    timelineStartMs: start,
    timelineDurationMs: duration,
    sourceInMs: 0,
    sourceDurationMs: duration,
    playbackRate: 1,
    order: count,
    transitions: { entry: null, exit: null },
  });
  start += duration;
}
let seed = 7458;
const random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};
for (let index = 0; index < count; index++) {
  const duration = mode === 'simultaneous' ? 60000 : 1000 + Math.floor(random() * 3000);
  const time = mode === 'simultaneous' ? 0 : Math.floor(random() * (60000 - duration));
  const size = 0.035 + random() * 0.055;
  clips.push({
    ...blur,
    id: randomUUID(),
    name: `Stress blur ${index + 1}`,
    enabled: true,
    trackId: randomUUID(),
    groupId: undefined,
    recordingClipId: null,
    order: index,
    timelineStartMs: time,
    timelineDurationMs: duration,
    sourceInMs: 0,
    sourceDurationMs: duration,
    playbackRate: 1,
    transform: { x: random() * (1 - size), y: random() * (1 - size), width: size, height: size },
    transitions: { entry: null, exit: null },
  });
}
manifest.projectId = randomUUID();
manifest.name = `Beam Stress — ${count.toLocaleString('en-US')} blurs ${mode} — 60s`;
manifest.createdAtUtc = manifest.updatedAtUtc = new Date().toISOString();
const screenSession = manifest.sessions?.find((session) => session.sessionId === asset.sessionId);
if (screenSession && asset.sessionPath)
  manifest.previewSrc = pathToFileURL(path.join(target, screenSession.relativePath, asset.sessionPath)).href;
composition.clips = clips;
composition.keyboardCaptionSessions = [];
composition.assets = [asset];
manifest.editor.zoom = {
  ...manifest.editor.zoom,
  elements: [],
  generatedSessions: [],
  motionBlur: { enabled: false, intensity: 0.55 },
};
cpSync(source, target, { recursive: true, dereference: true });
writeFileSync(path.join(target, 'project.json'), JSON.stringify(manifest));
if (
  createHash('sha256')
    .update(readFileSync(path.join(source, 'project.json')))
    .digest('hex') !== createHash('sha256').update(originalText).digest('hex')
)
  throw new Error('Source changed while creating fixture.');
console.log(JSON.stringify({ target, id: manifest.projectId, count, mode, durationMs: 60000, seed: 7458 }));
