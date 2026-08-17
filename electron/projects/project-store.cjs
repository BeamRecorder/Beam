const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');
const { fileURLToPath, pathToFileURL } = require('url');
const { kindFor } = require('../backgrounds/background-library.cjs');
const { emptyComposition, importMedia } = require('./clip-composition.cjs');
const { normalizeInputSidecar, recordedPlatform } = require('./input-sidecar.cjs');
const { createDefaultPresentation, zoomState } = require('./project-editor-state.cjs');
const { createProjectEditorAccess } = require('./project-editor-access.cjs');

function createProjectStore(root) {
  const safePath = (directory, relativePath) => {
    if (typeof relativePath !== 'string' || !relativePath) return null;
    const resolvedRoot = path.resolve(directory);
    const candidate = path.resolve(resolvedRoot, relativePath);
    return candidate === resolvedRoot || candidate.startsWith(`${resolvedRoot}${path.sep}`) ? candidate : null;
  };
  const existingFileWithin = (directory, candidate) => {
    try {
      const realRoot = fs.realpathSync(directory);
      const realFile = fs.realpathSync(candidate);
      return realFile.startsWith(`${realRoot}${path.sep}`) && fs.statSync(realFile).isFile() ? realFile : null;
    } catch {
      return null;
    }
  };
  const assertId = (id) => {
    if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
      throw new Error('Identifiant de projet invalide');
    return id;
  };
  const slugify = (value) => {
    const normalized = String(value)
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    return normalized.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'untitled-project';
  };
  const readManifest = (directory) => JSON.parse(fs.readFileSync(path.join(directory, 'project.json'), 'utf8'));
  const writeManifest = (directory, manifest) => {
    const target = path.join(directory, 'project.json');
    fs.writeFileSync(`${target}.tmp`, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    fs.renameSync(`${target}.tmp`, target);
  };
  const projectDirectories = () =>
    !fs.existsSync(root)
      ? []
      : fs
          .readdirSync(root, { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => path.join(root, entry.name))
          .filter((directory) => fs.existsSync(path.join(directory, 'project.json')));
  const directoryFor = (id) => {
    const projectId = assertId(id);
    const directory = projectDirectories().find((candidate) => {
      try {
        return readManifest(candidate).projectId === projectId;
      } catch {
        return false;
      }
    });
    if (!directory) throw new Error('Projet introuvable');
    return directory;
  };
  const sessionFileFor = (directory, sessionId, sessionPath) => {
    const project = readManifest(directory);
    const session = Array.isArray(project.sessions)
      ? project.sessions.find((entry) => entry?.sessionId === sessionId)
      : null;
    const sessionDirectory = session && safePath(directory, session.relativePath);
    return sessionDirectory ? safePath(sessionDirectory, sessionPath) : null;
  };
  const availableDirectory = (name, currentDirectory = null) => {
    const base = `project-${slugify(name)}`;
    for (let suffix = 1; suffix <= 2_147_483_647; suffix += 1) {
      const candidate = path.join(root, suffix === 1 ? base : `${base}-${suffix}`);
      if (candidate === currentDirectory || !fs.existsSync(candidate)) return candidate;
    }
    throw new Error('Impossible de créer un dossier de projet unique');
  };
  const thumbnailFor = (directory) => {
    for (const file of ['thumbnail.webp', 'thumbnail.png', 'thumbnail.jpg', 'thumbnail.jpeg']) {
      const target = path.join(directory, file);
      if (fs.existsSync(target)) return pathToFileURL(target).href;
    }
    return null;
  };
  const mediaUrlFor = (fileUrl) => {
    if (typeof fileUrl !== 'string') return null;
    let file;
    try {
      file = fileURLToPath(fileUrl);
    } catch {
      return null;
    }
    const relativePath = path.relative(root, file);
    const safeFile = safePath(root, relativePath);
    return safeFile && safeFile === path.resolve(file) && existingFileWithin(root, safeFile)
      ? `project-media://asset/${encodeURIComponent(relativePath.split(path.sep).join('/'))}`
      : null;
  };
  const mediaFileForUrl = (mediaUrl) => {
    let parsed;
    try {
      parsed = new URL(mediaUrl);
    } catch {
      return null;
    }
    if (parsed.protocol !== 'project-media:' || parsed.hostname !== 'asset') return null;
    let relativePath;
    try {
      relativePath = decodeURIComponent(parsed.pathname.slice(1));
    } catch {
      return null;
    }
    const file = safePath(root, relativePath);
    return file ? existingFileWithin(root, file) : null;
  };
  const previewFor = (directory, manifest, sessions) => {
    if (typeof manifest.previewSrc === 'string' && manifest.previewSrc) {
      let file;
      try {
        file = fileURLToPath(manifest.previewSrc);
      } catch {
        file = null;
      }
      if (file && fs.existsSync(file)) return mediaUrlFor(manifest.previewSrc);
    }
    for (const session of [...sessions].reverse()) {
      const sessionDirectory = safePath(directory, session.relativePath);
      const screenDirectory = sessionDirectory && path.join(sessionDirectory, 'screen');
      const video =
        screenDirectory &&
        fs.existsSync(screenDirectory) &&
        fs
          .readdirSync(screenDirectory)
          .filter((name) => /\.mp4$/i.test(name))
          .sort()[0];
      if (video) {
        const url = pathToFileURL(path.join(screenDirectory, video)).href;
        manifest.previewSrc = url;
        try {
          writeManifest(directory, manifest);
        } catch {}
        return mediaUrlFor(url);
      }
    }
    return null;
  };
  const hasVideoFiles = (dir) => {
    try {
      if (!dir || !fs.existsSync(dir)) return false;
      const stats = fs.statSync(dir);
      if (!stats.isDirectory()) return false;
      const entries = fs.readdirSync(dir);
      return entries.some(
        (entry) => /\.(mp4|webm|mov|mkv)$/i.test(entry) && fs.statSync(path.join(dir, entry)).size > 0,
      );
    } catch {
      return false;
    }
  };
  const assetFileExists = (directory, asset) => {
    if (!asset) return false;
    try {
      const target =
        asset.origin === 'session'
          ? sessionFileFor(directory, asset.sessionId, asset.sessionPath)
          : path.join(directory, 'media', asset.fileName);
      return Boolean(target && fs.existsSync(target) && fs.statSync(target).size > 0);
    } catch {
      return false;
    }
  };
  const hasCaptionContent = (clip) => {
    if (!clip || clip.kind !== 'caption') return false;
    if (clip.caption?.type === 'text' || Array.isArray(clip.caption?.sentences)) {
      const sentences = clip.caption?.sentences;
      return (
        Array.isArray(sentences) &&
        sentences.some(
          (s) =>
            (Array.isArray(s?.words) && s.words.length > 0) ||
            (typeof s?.text === 'string' && s.text.trim().length > 0),
        )
      );
    }
    if (clip.caption?.type === 'keyboard' || Array.isArray(clip.caption?.steps)) {
      const steps = clip.caption?.steps;
      return Array.isArray(steps) && steps.length > 0;
    }
    return false;
  };
  const hasKeyboardCaptionEvents = (directory, sessionIds) => {
    if (!Array.isArray(sessionIds) || sessionIds.length === 0) return false;
    return sessionIds.some((sessionId) => {
      try {
        const file = sessionFileFor(directory, sessionId, path.join('cursor', 'input.json'));
        if (!file || !fs.existsSync(file)) return false;
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        return Array.isArray(data?.events) && data.events.length > 0;
      } catch {
        return false;
      }
    });
  };
  const detectProjectFeatures = (directory, manifest, sessions) => {
    let hasScreen = false;
    let hasCamera = false;
    let hasCaption = false;

    const assets = Array.isArray(manifest.editor?.composition?.assets) ? manifest.editor.composition.assets : [];
    const assetsMap = new Map(assets.map((a) => [a.id, a]));

    const clips = Array.isArray(manifest.editor?.composition?.clips) ? manifest.editor.composition.clips : [];
    for (const clip of clips) {
      if (!clip) continue;
      if (clip.kind === 'screen' || clip.kind === 'video') {
        if (!hasScreen && clip.assetId && assetFileExists(directory, assetsMap.get(clip.assetId))) {
          hasScreen = true;
        }
      } else if (clip.kind === 'webcam') {
        if (!hasCamera && clip.assetId && assetFileExists(directory, assetsMap.get(clip.assetId))) {
          hasCamera = true;
        }
      } else if (clip.kind === 'caption') {
        if (!hasCaption && hasCaptionContent(clip)) {
          hasCaption = true;
        }
      }
    }

    if (
      !hasCaption &&
      Array.isArray(manifest.editor?.composition?.keyboardCaptionSessions) &&
      manifest.editor.composition.keyboardCaptionSessions.length > 0
    ) {
      hasCaption = hasKeyboardCaptionEvents(directory, manifest.editor.composition.keyboardCaptionSessions);
    }

    if ((!hasScreen || !hasCamera) && Array.isArray(sessions) && sessions.length > 0) {
      for (const session of sessions) {
        const sessionDirectory = safePath(directory, session?.relativePath);
        if (!sessionDirectory) continue;
        if (!hasScreen && hasVideoFiles(path.join(sessionDirectory, 'screen'))) {
          hasScreen = true;
        }
        if (!hasCamera && hasVideoFiles(path.join(sessionDirectory, 'camera'))) {
          hasCamera = true;
        }
      }
    }

    return { hasScreen, hasCamera, hasCaption };
  };
  const summary = (directory, manifest, fallbackId) => {
    const sessions = Array.isArray(manifest.sessions) ? manifest.sessions : [];
    const id = typeof manifest.projectId === 'string' ? manifest.projectId : fallbackId;
    const { hasScreen, hasCamera, hasCaption } = detectProjectFeatures(directory, manifest, sessions);
    return {
      id,
      name:
        typeof manifest.name === 'string' && manifest.name.trim() ? manifest.name.trim() : `Project ${id.slice(0, 8)}`,
      createdAt: typeof manifest.createdAtUtc === 'string' ? manifest.createdAtUtc : '',
      updatedAt: typeof manifest.updatedAtUtc === 'string' ? manifest.updatedAtUtc : '',
      sessionCount: sessions.length,
      previewSrc: previewFor(directory, manifest, sessions),
      thumbnailSrc: thumbnailFor(directory),
      hasScreen,
      hasCamera,
      hasCaption,
    };
  };
  const readJsonArray = (file) => {
    if (!fs.existsSync(file)) return null;
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return fs
        .readFileSync(file, 'utf8')
        .split(/\r?\n/)
        .filter(Boolean)
        .flatMap((line) => {
          try {
            return [JSON.parse(line)];
          } catch {
            return [];
          }
        });
    }
  };
  const telemetryFor = (file) => {
    if (!fs.existsSync(file)) return [];
    try {
      return (JSON.parse(fs.readFileSync(file, 'utf8'))?.samples || [])
        .filter(
          (sample) =>
            sample && Number.isFinite(sample.timeMs) && Number.isFinite(sample.cx) && Number.isFinite(sample.cy),
        )
        .map((sample) => ({
          timeMs: Math.max(0, sample.timeMs),
          cx: Math.max(0, Math.min(1, sample.cx)),
          cy: Math.max(0, Math.min(1, sample.cy)),
          interactionType: ['move', 'click', 'double-click', 'right-click', 'middle-click', 'mouseup'].includes(
            sample.interactionType,
          )
            ? sample.interactionType
            : undefined,
          cursorType: typeof sample.cursorType === 'string' ? sample.cursorType : undefined,
        }))
        .sort((a, b) => a.timeMs - b.timeMs);
    } catch {
      return [];
    }
  };
  const editorData = (id) => {
    const directory = directoryFor(id);
    const manifest = readManifest(directory);
    const sessions = Array.isArray(manifest.sessions) ? manifest.sessions : [];
    for (const session of [...sessions].reverse()) {
      const sessionDirectory = safePath(directory, session.relativePath);
      if (!sessionDirectory || !fs.existsSync(sessionDirectory)) continue;
      const manifestPath = [
        path.join(sessionDirectory, 'manifest.json'),
        path.join(sessionDirectory, 'manifest.partial.json'),
      ].find(fs.existsSync);
      if (!manifestPath) continue;
      let sessionManifest;
      try {
        sessionManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      } catch {
        continue;
      }
      const screenDirectory = path.join(sessionDirectory, 'screen');
      const video =
        fs.existsSync(screenDirectory) &&
        fs
          .readdirSync(screenDirectory)
          .filter((name) => /\.mp4$/i.test(name))
          .sort()[0];
      const tracks = Array.isArray(sessionManifest.tracks)
        ? sessionManifest.tracks.map((track) => ({
            ...track,
            assets: Array.isArray(track.segments)
              ? track.segments.map((segment) => {
                  const assetPath = safePath(sessionDirectory, segment.path);
                  const fileUrl = assetPath && fs.existsSync(assetPath) ? pathToFileURL(assetPath).href : null;
                  return {
                    ...segment,
                    src: fileUrl ? mediaUrlFor(fileUrl) : null,
                    exists: Boolean(assetPath && fs.existsSync(assetPath)),
                  };
                })
              : [],
          }))
        : [];
      const cursorDirectory = path.join(sessionDirectory, 'cursor');
      const events = readJsonArray(path.join(cursorDirectory, 'cursor.json'));
      let interactions = null;
      try {
        const parsed = JSON.parse(fs.readFileSync(path.join(cursorDirectory, 'input.json'), 'utf8'));
        interactions = normalizeInputSidecar(parsed);
      } catch {}
      let metadata = {};
      try {
        metadata = JSON.parse(fs.readFileSync(path.join(cursorDirectory, 'shapes.json'), 'utf8')) || {};
      } catch {}
      const catalog = Object.fromEntries(
        Object.entries(metadata)
          .filter(
            ([, value]) =>
              value &&
              typeof value === 'object' &&
              typeof value.cursorKind === 'string' &&
              typeof value.nativeCursorId === 'string',
          )
          .map(([cursorId, value]) => [
            cursorId,
            {
              cursorKind: value.cursorKind,
              nativeCursorId: value.nativeCursorId,
              hotspot: value.hotspot || { x: 0, y: 0 },
            },
          ]),
      );
      const shapes = Object.fromEntries(
        Object.entries(metadata).flatMap(([shapeId, value]) => {
          const shapePath = path.join(cursorDirectory, 'shapes', `${shapeId}.png`);
          return fs.existsSync(shapePath)
            ? [[shapeId, { src: pathToFileURL(shapePath).href, hotspot: value?.hotspot || value || { x: 0, y: 0 } }]]
            : [];
        }),
      );
      const missing = Object.keys(metadata)
        .filter((shapeId) => !catalog[shapeId] && !shapes[shapeId])
        .map((shapeId) => `shapes/${shapeId}.png`);
      return {
        sessionId: session.sessionId,
        manifest: sessionManifest,
        videoSrc: video ? mediaUrlFor(pathToFileURL(path.join(screenDirectory, video)).href) : null,
        tracks,
        cursor: {
          available: Array.isArray(events),
          events: events || [],
          telemetry: telemetryFor(path.join(cursorDirectory, 'telemetry.json')),
          shapes,
          catalog,
          missing: [...(Array.isArray(events) ? [] : ['cursor.json']), ...missing],
        },
        interactions: interactions || { version: 1, events: [] },
        recordedPlatform: recordedPlatform(sessionManifest.platform?.os),
        zoom: manifest.editor?.zoom ? zoomState(manifest.editor.zoom) : { elements: [], generatedSessions: [] },
      };
    }
    return null;
  };
  const generatedBaseName = (id) => {
    const adjectives = ['Bright', 'Calm', 'Clever', 'Golden', 'Quiet', 'Rapid', 'Soft', 'Vivid'];
    const nouns = ['Aurora', 'Canvas', 'Comet', 'Horizon', 'Orbit', 'Pixel', 'Signal', 'Studio'];
    return `${adjectives[Number.parseInt(id.slice(0, 2), 16) % adjectives.length]} ${nouns[Number.parseInt(id.slice(2, 4), 16) % nouns.length]}`;
  };
  const generatedName = (id) => {
    const baseName = generatedBaseName(id);
    const names = new Set(
      projectDirectories().flatMap((directory) => {
        try {
          return [readManifest(directory).name];
        } catch {
          return [];
        }
      }),
    );
    if (!names.has(baseName)) return baseName;
    for (let suffix = 2; suffix <= 2_147_483_647; suffix += 1)
      if (!names.has(`${baseName} ${suffix}`)) return `${baseName} ${suffix}`;
    throw new Error('Impossible de générer un nom de projet unique');
  };
  const { editorState, saveEditorState } = createProjectEditorAccess({
    directoryFor,
    readManifest,
    writeManifest,
    sessionFileFor,
    mediaUrlFor,
  });
  const applyPendingRenames = () => {
    for (const directory of projectDirectories()) {
      let manifest;
      try {
        manifest = readManifest(directory);
      } catch {
        continue;
      }
      if (typeof manifest.pendingDirectorySlug !== 'string' || !manifest.pendingDirectorySlug) continue;
      const target = availableDirectory(manifest.pendingDirectorySlug, directory);
      try {
        fs.renameSync(directory, target);
        delete manifest.pendingDirectorySlug;
        writeManifest(target, manifest);
      } catch {}
    }
  };
  const importBackground = (id, input = {}) => {
    const directory = directoryFor(id);
    const source = input.source;
    if (typeof source !== 'string' || !source) throw new Error('Fond importé invalide');
    let sourceStats;
    try {
      sourceStats = fs.statSync(source);
    } catch {
      throw new Error('Fond importé invalide');
    }
    if (!sourceStats.isFile()) throw new Error('Fond importé invalide');
    const extension = path.extname(source).toLowerCase();
    const kind = kindFor(source);
    if (!kind) throw new Error('Type de fond non autorisé');
    const targetDirectory = path.join(directory, 'backgrounds');
    fs.mkdirSync(targetDirectory, { recursive: true });
    const fileName = `${randomUUID()}${extension}`;
    const targetPath = path.join(targetDirectory, fileName);
    fs.copyFileSync(source, targetPath);
    return {
      id: `project-bg:${fileName}`,
      name: path.basename(source, extension).slice(0, 160),
      fileName,
      extension: extension.slice(1),
      kind,
      path: pathToFileURL(targetPath).href,
    };
  };

  applyPendingRenames();
  return {
    list: () =>
      projectDirectories()
        .map((directory) => {
          try {
            const manifest = readManifest(directory);
            return summary(directory, manifest, manifest.projectId);
          } catch {
            return null;
          }
        })
        .filter(Boolean)
        .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))),
    mediaUrlFor,
    mediaFileForUrl,
    directoryFor,
    teleprompterFileFor: (id, sessionId) =>
      sessionFileFor(directoryFor(id), sessionId, path.join('session', 'teleprompter.json')),
    editorData,
    editorState,
    saveEditorState,
    importEditorMedia: (id, input) => {
      const asset = importMedia(directoryFor(id), input);
      return { ...asset, src: mediaUrlFor(asset.src) || '' };
    },
    importDroppedProjectMedia: (id, input) => {
      if (!input || typeof input.source !== 'string' || !input.source) throw new Error('Chemin du média invalide');
      let stats;
      try {
        stats = fs.statSync(input.source);
      } catch {
        throw new Error('Fichier média invalide');
      }
      if (!stats.isFile()) throw new Error('Fichier média invalide');
      const asset = importMedia(directoryFor(id), input);
      return { ...asset, src: mediaUrlFor(asset.src) || '' };
    },
    importBackground,
    create: (options = {}) => {
      const id = randomUUID();
      const now = new Date().toISOString();
      const name =
        typeof options.name === 'string' && options.name.trim() ? options.name.trim().slice(0, 80) : generatedName(id);
      fs.mkdirSync(root, { recursive: true });
      const directory = availableDirectory(name);
      fs.mkdirSync(directory);
      const manifest = {
        schemaVersion: 1,
        projectId: id,
        name,
        createdAtUtc: now,
        updatedAtUtc: now,
        sessions: [],
        editor: {
          schemaVersion: 3,
          applyGlobalDefaults: true,
          composition: emptyComposition(),
          zoom: { elements: [], generatedSessions: [] },
          presentation: createDefaultPresentation(),
        },
      };
      writeManifest(directory, manifest);
      return summary(directory, manifest, id);
    },
    rename: (id, name) => {
      const directory = directoryFor(id);
      const manifest = readManifest(directory);
      const nextName = typeof name === 'string' ? name.trim().slice(0, 80) : '';
      if (!nextName) throw new Error('Le nom du projet ne peut pas être vide');
      const target = availableDirectory(nextName, directory);
      manifest.name = nextName;
      manifest.updatedAtUtc = new Date().toISOString();
      try {
        fs.renameSync(directory, target);
        delete manifest.pendingDirectorySlug;
        writeManifest(target, manifest);
        return summary(target, manifest, id);
      } catch {
        manifest.pendingDirectorySlug = slugify(nextName);
        writeManifest(directory, manifest);
        return summary(directory, manifest, id);
      }
    },
    saveThumbnail: (id, dataUrl) => {
      const directory = directoryFor(id);
      if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) return null;
      const targetPath = path.join(directory, 'thumbnail.webp');
      fs.writeFileSync(targetPath, Buffer.from(dataUrl.replace(/^data:image\/\w+;base64,/, ''), 'base64'));
      return pathToFileURL(targetPath).href;
    },
    delete: (id) => fs.rmSync(directoryFor(id), { recursive: true, force: false }),
  };
}

module.exports = { createProjectStore };
