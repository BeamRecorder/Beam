const compositingKinds = new Set(['screen', 'video', 'image', 'webcam', 'color', 'shape', 'blur']);

const isCompositing = (clip) => compositingKinds.has(clip?.kind);
const endMs = (clip) => clip.timelineStartMs + clip.timelineDurationMs;

const visualSignature = (clip) =>
  JSON.stringify({
    kind: clip.kind,
    assetId: clip.assetId,
    name: clip.name,
    playbackRate: clip.playbackRate,
    enabled: clip.enabled,
    transform: clip.transform,
    crop: clip.crop,
    appearance: clip.appearance,
    isMirrored: clip.isMirrored,
    isMirroredY: clip.isMirroredY,
    shapeStyle:
      clip.kind === 'shape'
        ? {
            family: clip.family,
            preset: clip.preset,
            fillColor: clip.fillColor,
            borderColor: clip.borderColor,
            borderWidth: clip.borderWidth,
            cornerRadius: clip.cornerRadius,
            arrowThickness: clip.arrowThickness,
            arrowHeadSize: clip.arrowHeadSize,
            rotation: clip.rotation,
            opacityEnabled: clip.opacityEnabled,
            opacity: clip.opacity,
            backdropBlur: clip.backdropBlur,
            shadowEnabled: clip.shadowEnabled,
            shadowColor: clip.shadowColor,
            shadowBlur: clip.shadowBlur,
            shadowDirection: clip.shadowDirection,
          }
        : undefined,
  });

const isCertainSplitContinuation = (left, right) =>
  !['blur', 'color', 'shape'].includes(left.kind) &&
  !['blur', 'color', 'shape'].includes(right.kind) &&
  visualSignature(left) === visualSignature(right) &&
  endMs(left) === right.timelineStartMs &&
  left.sourceInMs + left.sourceDurationMs === right.sourceInMs;

const isTechnicalSplitContinuation = (left, right) =>
  !['blur', 'color', 'shape'].includes(left.kind) &&
  !['blur', 'color', 'shape'].includes(right.kind) &&
  left.kind === right.kind &&
  left.assetId === right.assetId &&
  endMs(left) === right.timelineStartMs &&
  left.sourceInMs + left.sourceDurationMs === right.sourceInMs;

const assignMigratedTrackIds = (clips) => {
  const orderedVisuals = clips.filter(isCompositing);
  const continuations = new Map();
  const predecessors = new Map();
  for (const left of orderedVisuals) {
    const candidates = orderedVisuals.filter(
      (right) => left.id !== right.id && isCertainSplitContinuation(left, right),
    );
    if (candidates.length === 1) continuations.set(left.id, candidates[0].id);
  }
  for (const [leftId, rightId] of continuations) {
    const candidates = predecessors.get(rightId) ?? [];
    candidates.push(leftId);
    predecessors.set(rightId, candidates);
  }
  const trackByClip = new Map();
  for (const clip of orderedVisuals) {
    if (trackByClip.has(clip.id)) continue;
    let first = clip;
    const visited = new Set();
    while ((predecessors.get(first.id)?.length ?? 0) === 1 && !visited.has(first.id)) {
      visited.add(first.id);
      first = orderedVisuals.find((entry) => entry.id === predecessors.get(first.id)[0]) ?? first;
    }
    const trackId = first.id;
    let current = first;
    while (!trackByClip.has(current.id)) {
      trackByClip.set(current.id, trackId);
      const nextId = continuations.get(current.id);
      if (!nextId || (predecessors.get(nextId)?.length ?? 0) !== 1) break;
      const next = orderedVisuals.find((entry) => entry.id === nextId);
      if (!next) break;
      current = next;
    }
  }
  return clips.map((clip) => (isCompositing(clip) ? { ...clip, trackId: trackByClip.get(clip.id) } : clip));
};

const repairMigratedTrackIds = (clips) => {
  const visuals = clips.filter(isCompositing);
  const byId = new Map(visuals.map((clip) => [clip.id, clip]));
  const legacyTrackIds = new Set(visuals.filter((clip) => clip.trackId === clip.id).map((clip) => clip.trackId));
  const nextById = new Map();
  const previousById = new Map();
  for (const left of visuals) {
    const candidates = visuals.filter((right) => left.id !== right.id && isTechnicalSplitContinuation(left, right));
    if (candidates.length !== 1) continue;
    nextById.set(left.id, candidates[0].id);
    const previous = previousById.get(candidates[0].id) ?? [];
    previous.push(left.id);
    previousById.set(candidates[0].id, previous);
  }
  const repairedTrackIds = new Map(visuals.map((clip) => [clip.id, clip.trackId]));
  for (const root of visuals) {
    if ((previousById.get(root.id)?.length ?? 0) === 1) continue;
    const chain = [root];
    let current = root;
    while (nextById.has(current.id)) {
      const nextId = nextById.get(current.id);
      if ((previousById.get(nextId)?.length ?? 0) !== 1) break;
      const next = byId.get(nextId);
      if (!next || chain.includes(next)) break;
      chain.push(next);
      current = next;
    }
    if (chain.length < 2 || chain.some((clip) => !legacyTrackIds.has(clip.trackId))) continue;
    for (const clip of chain) repairedTrackIds.set(clip.id, root.trackId);
  }
  return clips.map((clip) =>
    isCompositing(clip) ? { ...clip, trackId: repairedTrackIds.get(clip.id) ?? clip.trackId } : clip,
  );
};

const normalizeTrackOrders = (clips) => {
  const buckets = new Map();
  const ordered = [...clips].sort(
    (left, right) =>
      left.order - right.order || left.timelineStartMs - right.timelineStartMs || left.id.localeCompare(right.id),
  );
  for (const clip of ordered) {
    const key = isCompositing(clip) ? `track:${clip.trackId}` : `clip:${clip.id}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(clip);
    else buckets.set(key, [clip]);
  }
  return [...buckets.values()].flatMap((bucket, order) =>
    bucket
      .sort((left, right) => left.timelineStartMs - right.timelineStartMs || left.id.localeCompare(right.id))
      .map((clip) => ({ ...clip, order })),
  );
};

const validateTrackLayout = (clips) => {
  const tracks = new Map();
  for (const clip of clips) {
    if (!isCompositing(clip)) continue;
    const track = tracks.get(clip.trackId);
    if (track) track.push(clip);
    else tracks.set(clip.trackId, [clip]);
  }
  for (const track of tracks.values()) {
    const ordered = [...track].sort((left, right) => left.timelineStartMs - right.timelineStartMs);
    for (let index = 1; index < ordered.length; index += 1) {
      if (ordered[index].timelineStartMs < endMs(ordered[index - 1])) {
        throw new Error('Les fragments d’une piste visuelle ne peuvent pas se chevaucher');
      }
    }
  }
};

module.exports = { assignMigratedTrackIds, repairMigratedTrackIds, normalizeTrackOrders, validateTrackLayout };
