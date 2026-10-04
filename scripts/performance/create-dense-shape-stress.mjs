// Independent minute-long fixture with real videos/effects and 10,000 editable outlines.
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function denseShapeManifest(sourceText, source, target) {
  const manifest = JSON.parse(sourceText.split(source).join(target));
  const composition = manifest.editor?.composition;
  const shape = composition?.clips.find((clip) => clip.kind === 'shape');
  if (
    !shape ||
    !composition.clips.some((clip) => clip.kind === 'video') ||
    !composition.clips.some((clip) => clip.kind === 'blur')
  )
    throw new Error('Use the minute-long mixed video/shape/effect fixture as the source.');
  const media = composition.clips.filter((clip) => clip.kind !== 'shape');
  if (!media.some((clip) => clip.timelineStartMs + clip.timelineDurationMs === 60000))
    throw new Error('Source must cover the full minute.');
  const width = manifest.editor.presentation.canvas.width,
    height = manifest.editor.presentation.canvas.height;
  if (width !== 1920 || height !== 1080) throw new Error('Dense pixel-parity fixture requires 1920x1080.');
  let seed = 7458;
  const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const shapes = Array.from({ length: 10000 }, (_, i) => {
    const id = randomUUID();
    const x = 48 + Math.floor(random() * 1760),
      y = 48 + Math.floor(random() * 928);
    return {
      ...shape,
      id,
      trackId: id,
      name: `Dense rectangle ${i + 1}`,
      enabled: true,
      order: i,
      family: 'shape',
      preset: 'rectangle',
      rotation: 0,
      fillEnabled: false,
      fill: undefined,
      fillColor: '#ff5a1f',
      borderColor: i % 2 ? '#ffc24a' : '#ce3a65',
      borderWidth: 8,
      shadowEnabled: false,
      opacityEnabled: false,
      text: undefined,
      drawing: undefined,
      groupId: undefined,
      recordingClipId: null,
      transitions: { entry: null, exit: null },
      timelineStartMs: 0,
      timelineDurationMs: 60000,
      sourceInMs: 0,
      sourceDurationMs: 60000,
      playbackRate: 1,
      transform: { x: x / width, y: y / height, width: 48 / width, height: 32 / height },
    };
  });
  composition.clips = [...media.map((clip) => ({ ...clip, order: clip.order + 10000 })), ...shapes];
  manifest.projectId = randomUUID();
  manifest.name = 'Beam Stress — 10,000 rectangles + real videos/effects — 60s';
  manifest.createdAtUtc = manifest.updatedAtUtc = new Date().toISOString();
  return manifest;
}

export function createDenseShapeStress(sourceArgument, targetArgument) {
  if (!sourceArgument || !targetArgument) throw new Error('Usage: SOURCE NEW_TARGET');
  const source = path.resolve(sourceArgument),
    target = path.resolve(targetArgument);
  if (existsSync(target) || target === source || target.startsWith(source + path.sep))
    throw new Error('Use a fresh destination outside the source.');
  const file = path.join(source, 'project.json'),
    original = readFileSync(file, 'utf8');
  const manifest = denseShapeManifest(original, source, target);
  mkdirSync(target, { recursive: false });
  cpSync(source, target, { recursive: true, dereference: true, force: false, errorOnExist: true });
  writeFileSync(path.join(target, 'project.json'), JSON.stringify(manifest));
  if (
    createHash('sha256').update(readFileSync(file)).digest('hex') !==
    createHash('sha256').update(original).digest('hex')
  )
    throw new Error('Source changed during fixture creation.');
  return {
    target,
    id: manifest.projectId,
    seed: 7458,
    shapes: 10000,
    durationMs: 60000,
    clips: manifest.editor.composition.clips.length,
  };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  console.log(JSON.stringify(createDenseShapeStress(...process.argv.slice(2))));
