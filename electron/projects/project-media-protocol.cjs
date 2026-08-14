const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');

const MIME_TYPES = Object.freeze({
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.m4a': 'audio/mp4',
  '.mkv': 'video/x-matroska',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.oga': 'audio/ogg',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.png': 'image/png',
  '.wav': 'audio/wav',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
});

function mimeTypeFor(file) {
  return MIME_TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
}

function parseSingleRange(value, size) {
  if (typeof value !== 'string' || !Number.isSafeInteger(size) || size <= 0) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || (!match[1] && !match[2])) return null;

  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;
    const start = Math.max(0, size - suffixLength);
    return { start, end: size - 1, length: size - start };
  }

  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : size - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(requestedEnd) ||
    start < 0 ||
    start >= size ||
    requestedEnd < start
  ) {
    return null;
  }
  const end = Math.min(requestedEnd, size - 1);
  return { start, end, length: end - start + 1 };
}

function responseHeaders(file, contentLength) {
  return new Headers({
    'Accept-Ranges': 'bytes',
    'Access-Control-Allow-Origin': '*',
    'Content-Length': String(contentLength),
    'Content-Type': mimeTypeFor(file),
  });
}

function rangeNotSatisfiable(size) {
  return new Response(null, {
    status: 416,
    headers: {
      'Accept-Ranges': 'bytes',
      'Access-Control-Allow-Origin': '*',
      'Content-Range': `bytes */${size}`,
      'Content-Length': '0',
    },
  });
}

function createProjectMediaHandler({ projectStore, backgroundLibrary }) {
  if (!projectStore || typeof projectStore.mediaFileForUrl !== 'function') {
    throw new TypeError('projectStore.mediaFileForUrl must be a function.');
  }
  if (backgroundLibrary && typeof backgroundLibrary.fileForUrl !== 'function') {
    throw new TypeError('backgroundLibrary.fileForUrl must be a function.');
  }

  return async function handleProjectMedia(request) {
    try {
      const file = projectStore.mediaFileForUrl(request.url) ?? backgroundLibrary?.fileForUrl(request.url);
      if (!file) return new Response('Not found', { status: 404 });
      const stat = await fs.promises.stat(file);
      if (!stat.isFile()) return new Response('Not found', { status: 404 });

      const rangeHeader = request.headers.get('range');
      if (rangeHeader !== null) {
        const range = parseSingleRange(rangeHeader, stat.size);
        if (!range) return rangeNotSatisfiable(stat.size);
        const headers = responseHeaders(file, range.length);
        headers.set('Content-Range', `bytes ${range.start}-${range.end}/${stat.size}`);
        const body = request.method === 'HEAD' ? null : Readable.toWeb(fs.createReadStream(file, range));
        return new Response(body, { status: 206, headers });
      }

      const headers = responseHeaders(file, stat.size);
      const body = request.method === 'HEAD' ? null : Readable.toWeb(fs.createReadStream(file));
      return new Response(body, { status: 200, headers });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  };
}

module.exports = { createProjectMediaHandler, mimeTypeFor, parseSingleRange };
