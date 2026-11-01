const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { version } = require('../../../../package.json');

// Walk headers with positional reads, never loading a recording into memory.
function inspectMp4(handle, fileSize) {
  const boxes = [];
  const header = Buffer.alloc(16);
  let offset = 0;
  while (offset < fileSize && boxes.length < 128) {
    const read = fs.readSync(handle, header, 0, Math.min(16, fileSize - offset), offset);
    if (read < 8) return { status: 'truncated-header', boxes };
    let size = header.readUInt32BE(0);
    const type = header.toString('latin1', 4, 8);
    const headerSize = size === 1 ? 16 : 8;
    if (size === 1) {
      if (read < 16) return { status: 'truncated-header', boxes };
      const largeSize = header.readBigUInt64BE(8);
      if (largeSize > BigInt(Number.MAX_SAFE_INTEGER)) return { status: 'invalid-size', boxes };
      size = Number(largeSize);
    } else if (size === 0) size = fileSize - offset;
    if (size < headerSize) return { status: 'invalid-size', boxes };
    boxes.push({ type, offset, size });
    if (size > fileSize - offset) return { status: 'truncated-box', boxes };
    offset += size;
  }
  return { status: offset === fileSize ? 'headers-read' : 'inspection-limit', boxes };
}

function recordingAssetDiagnostic(directory, relativePath) {
  let handle;
  try {
    if (typeof relativePath !== 'string' || !relativePath || path.isAbsolute(relativePath))
      return { path: relativePath, errorCode: 'INVALID_PATH' };
    const root = fs.realpathSync(directory);
    const file = fs.realpathSync(path.resolve(root, relativePath));
    if (!file.startsWith(`${root}${path.sep}`)) return { path: relativePath, errorCode: 'INVALID_PATH' };
    handle = fs.openSync(file, 'r');
    const stat = fs.fstatSync(handle);
    if (!stat.isFile()) return { path: relativePath, errorCode: 'NOT_A_FILE' };
    return {
      path: relativePath,
      sizeBytes: stat.size,
      modifiedAt: stat.mtime.toISOString(),
      ...(path.extname(relativePath).toLowerCase() === '.mp4' ? { mp4: inspectMp4(handle, stat.size) } : {}),
    };
  } catch (error) {
    return { path: relativePath, errorCode: error.code || 'INSPECTION_FAILED' };
  } finally {
    if (handle !== undefined) fs.closeSync(handle);
  }
}

function recordingDiagnostics(directory, tracks) {
  return {
    sampledAt: new Date().toISOString(),
    environment: {
      beamVersion: version,
      electronVersion: process.versions.electron ?? null,
      chromiumVersion: process.versions.chrome ?? null,
      platform: process.platform,
      osRelease: os.release(),
      architecture: process.arch,
      cpuModel: os.cpus()[0]?.model ?? null,
      logicalCpuCount: os.availableParallelism(),
      totalMemoryBytes: os.totalmem(),
      availableMemoryBytes: os.freemem(),
    },
    assets: tracks.flatMap((track) =>
      track.assets.map((asset) => ({ trackId: track.trackId, ...recordingAssetDiagnostic(directory, asset.path) })),
    ),
  };
}

module.exports = { recordingAssetDiagnostic, recordingDiagnostics };
