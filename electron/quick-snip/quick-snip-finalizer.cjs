const fs = require('fs');
const path = require('path');
const { fileURLToPath } = require('url');

function safeName(value) {
  const name = String(value || 'Quick Snip')
    .normalize('NFKD')
    .replace(/[^a-z0-9._ -]+/gi, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return name || 'Quick Snip';
}

function availableFile(directory, base, extension) {
  for (let suffix = 1; suffix < Number.MAX_SAFE_INTEGER; suffix += 1) {
    const candidate = path.join(directory, `${base}${suffix === 1 ? '' : ` ${suffix}`}.${extension}`);
    if (!fs.existsSync(candidate) && !fs.existsSync(`${candidate}.partial`)) return candidate;
  }
  throw new Error('Unable to allocate a Quick Snip output filename.');
}

function resolveVideoPath(session) {
  if (typeof session?.videoSrc === 'string' && session.videoSrc.startsWith('file:'))
    return fileURLToPath(session.videoSrc);
  if (typeof session?.manifestPath !== 'string') throw new Error('Quick Snip session has no native video.');
  const directory = path.join(path.dirname(session.manifestPath), 'screen');
  const name = fs
    .readdirSync(directory)
    .filter((entry) => /\.mp4$/i.test(entry))
    .sort()[0];
  if (!name) throw new Error('Quick Snip session has no completed native video.');
  return path.join(directory, name);
}

function abortError() {
  const error = new Error('Quick Snip export was canceled.');
  error.name = 'AbortError';
  return error;
}

function removeRawWork(userPaths, session, source) {
  const workRoot = path.resolve(userPaths.quickSnipWork);
  const manifestDirectory = path.resolve(path.dirname(session.manifestPath || source));
  if (!manifestDirectory.startsWith(`${workRoot}${path.sep}`)) return;
  const [projectName] = path.relative(workRoot, manifestDirectory).split(path.sep);
  if (projectName) fs.rmSync(path.join(workRoot, projectName), { recursive: true, force: true });
}

function applyEditorPreset(state, editor, automaticZoom) {
  const settings = editor && typeof editor === 'object' ? editor : {};
  const visual = settings.visual && typeof settings.visual === 'object' ? settings.visual : {};
  const copyFields = (clip, defaults, fields) => {
    if (!defaults || typeof defaults !== 'object') return clip;
    const next = { ...clip };
    for (const field of fields) {
      if (defaults[field] !== undefined) next[field] = structuredClone(defaults[field]);
    }
    return next;
  };
  const clips = Array.isArray(state.composition?.clips)
    ? state.composition.clips.map((clip) => {
        if (['screen', 'video', 'image', 'webcam'].includes(clip.kind)) {
          return copyFields(clip, visual[clip.kind], [
            'transform',
            'appearance',
            'isMirrored',
            'isMirroredY',
            'playbackRate',
            'transitions',
            'cameraLayoutPreset',
            'cameraFramingPreset',
            'cameraSplitRatio',
            'cameraSplitPadding',
            'reactToZoom',
          ]);
        }
        if (clip.kind === 'audio') return copyFields(clip, settings.audio, ['volume', 'playbackRate']);
        if (clip.kind === 'caption') {
          const next = copyFields(clip, settings.caption, ['transform']);
          if (settings.caption?.style && clip.caption) {
            next.caption = {
              ...clip.caption,
              style: {
                ...structuredClone(settings.caption.style),
                ...(clip.caption.style?.customText === undefined ? {} : { customText: clip.caption.style.customText }),
              },
            };
          }
          return next;
        }
        if (clip.kind === 'blur') {
          return copyFields(clip, settings.blur, [
            'transform',
            'shape',
            'mode',
            'strength',
            'feather',
            'cornerRadius',
            'tintOpacity',
            'color',
          ]);
        }
        return clip;
      })
    : [];
  state.composition = { ...state.composition, clips };
  if (settings.presentation && typeof settings.presentation === 'object') {
    state.presentation = { ...state.presentation, ...structuredClone(settings.presentation), importedBackgrounds: [] };
  }
  if (settings.zoomMotionBlur && typeof settings.zoomMotionBlur === 'object') {
    state.zoom.motionBlur = structuredClone(settings.zoomMotionBlur);
  }
  state.zoom.elements = state.zoom.elements.map((zoom) => ({
    ...zoom,
    enabled: automaticZoom !== false,
  }));
  return state;
}

function createQuickSnipFinalizer({ userPaths, projectStore }) {
  return async ({ session, configuration, onProgress = () => {}, signal }) => {
    const source = resolveVideoPath(session);
    const outputDirectory = configuration.mode === 'raw' ? userPaths.quickSnipRaw : userPaths.quickSnipStudio;
    fs.mkdirSync(outputDirectory, { recursive: true });
    const extension = configuration.format === 'webm' ? 'webm' : 'mp4';
    if (extension === 'webm') throw new Error('WebM Quick Snip export requires the renderer export pipeline.');
    const target = availableFile(outputDirectory, safeName(configuration.name), extension);
    const partial = `${target}.partial`;
    try {
      if (signal?.aborted) throw abortError();
      onProgress(0.2);
      await fs.promises.copyFile(source, partial, fs.constants.COPYFILE_EXCL);
      if (signal?.aborted) throw abortError();
      await fs.promises.rename(partial, target);
      if (signal?.aborted) throw abortError();
      onProgress(0.9);
      if (signal?.aborted) throw abortError();
      if (configuration.mode === 'studio' && session.projectId) {
        const state = applyEditorPreset(
          projectStore.editorState(session.projectId),
          configuration.preset?.settings?.editor,
          configuration.automaticZoom,
        );
        projectStore.saveEditorState(session.projectId, state);
      }
      if (configuration.mode === 'raw') removeRawWork(userPaths, session, source);
      onProgress(1);
      if (signal?.aborted) throw abortError();
      return { path: target, projectId: configuration.mode === 'studio' ? (session.projectId ?? null) : null };
    } catch (error) {
      fs.rmSync(partial, { force: true });
      if (signal?.aborted) fs.rmSync(target, { force: true });
      if (configuration.mode === 'raw') removeRawWork(userPaths, session, source);
      throw error;
    }
  };
}

module.exports = {
  abortError,
  applyEditorPreset,
  availableFile,
  createQuickSnipFinalizer,
  removeRawWork,
  resolveVideoPath,
  safeName,
};
