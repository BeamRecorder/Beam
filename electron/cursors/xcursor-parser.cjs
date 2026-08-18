const zlib = require('zlib');

const XCURSOR_MAGIC = 'Xcur';
const XCURSOR_IMAGE_TYPE = 0xfffd0002;
const MAX_TOC_ENTRIES = 1_024;
const MAX_DIMENSION = 1_024;
const MAX_PIXELS = MAX_DIMENSION * MAX_DIMENSION;

function uint32(buffer, offset, label) {
  if (offset < 0 || offset + 4 > buffer.length) throw new Error(`XCursor tronqué (${label})`);
  return buffer.readUInt32LE(offset);
}

function parseImage(buffer, position, expectedSubtype) {
  const header = uint32(buffer, position, 'en-tête image');
  const type = uint32(buffer, position + 4, 'type image');
  const subtype = uint32(buffer, position + 8, 'taille image');
  const version = uint32(buffer, position + 12, 'version image');
  const width = uint32(buffer, position + 16, 'largeur image');
  const height = uint32(buffer, position + 20, 'hauteur image');
  const hotspotX = uint32(buffer, position + 24, 'hotspot horizontal');
  const hotspotY = uint32(buffer, position + 28, 'hotspot vertical');
  const delay = uint32(buffer, position + 32, 'délai image');
  if (header < 36 || type !== XCURSOR_IMAGE_TYPE || subtype !== expectedSubtype || version !== 1)
    throw new Error('Image XCursor invalide');
  if (subtype === 0 || subtype > MAX_DIMENSION) throw new Error('Taille nominale XCursor invalide');
  if (width === 0 || height === 0 || width > MAX_DIMENSION || height > MAX_DIMENSION || width * height > MAX_PIXELS)
    throw new Error('Dimensions XCursor invalides');
  if (hotspotX >= width || hotspotY >= height) throw new Error('Hotspot XCursor hors des dimensions');
  const pixelStart = position + header;
  const pixelBytes = width * height * 4;
  if (pixelStart > buffer.length || pixelBytes > buffer.length - pixelStart) throw new Error('Pixels XCursor tronqués');
  return {
    width,
    height,
    hotspot: { x: hotspotX, y: hotspotY },
    delay,
    pixels: buffer.subarray(pixelStart, pixelStart + pixelBytes),
  };
}

function parseXcursor(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 16 || buffer.subarray(0, 4).toString('ascii') !== XCURSOR_MAGIC)
    throw new Error('Fichier XCursor invalide');
  const header = uint32(buffer, 4, 'en-tête');
  const version = uint32(buffer, 8, 'version');
  const count = uint32(buffer, 12, 'table des matières');
  if (header < 16 || header > buffer.length || version !== 0x00010000 || count === 0 || count > MAX_TOC_ENTRIES)
    throw new Error('En-tête XCursor invalide');
  if (count > Math.floor((buffer.length - header) / 12)) throw new Error('Table XCursor tronquée');

  const images = [];
  for (let index = 0; index < count; index += 1) {
    const offset = header + index * 12;
    const type = uint32(buffer, offset, 'type de bloc');
    const subtype = uint32(buffer, offset + 4, 'sous-type de bloc');
    const position = uint32(buffer, offset + 8, 'position de bloc');
    if (type !== XCURSOR_IMAGE_TYPE) continue;
    images.push({ nominalSize: subtype, ...parseImage(buffer, position, subtype) });
  }
  if (images.length === 0) throw new Error('Aucune image XCursor trouvée');

  const countsBySize = new Map();
  for (const image of images) countsBySize.set(image.nominalSize, (countsBySize.get(image.nominalSize) ?? 0) + 1);
  if ([...countsBySize.values()].some((countForSize) => countForSize > 1)) return { animated: true };
  return {
    animated: false,
    image: images.reduce((largest, image) =>
      image.width * image.height > largest.width * largest.height ? image : largest,
    ),
  };
}

let crcTable;
function crc32(buffer) {
  if (!crcTable) {
    crcTable = Array.from({ length: 256 }, (_, value) => {
      let crc = value;
      for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
      return crc >>> 0;
    });
  }
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const chunk = Buffer.allocUnsafe(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBuffer.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
  return chunk;
}

function xcursorImageToPng(image) {
  const stride = image.width * 4;
  const rows = Buffer.allocUnsafe((stride + 1) * image.height);
  for (let y = 0; y < image.height; y += 1) {
    const outputRow = y * (stride + 1);
    rows[outputRow] = 0;
    for (let x = 0; x < image.width; x += 1) {
      const input = (y * image.width + x) * 4;
      const output = outputRow + 1 + x * 4;
      const alpha = image.pixels[input + 3];
      const unpremultiply = (channel) =>
        alpha > 0 && alpha < 255 ? Math.min(255, Math.round((channel * 255) / alpha)) : channel;
      rows[output] = unpremultiply(image.pixels[input + 2]);
      rows[output + 1] = unpremultiply(image.pixels[input + 1]);
      rows[output + 2] = unpremultiply(image.pixels[input]);
      rows[output + 3] = alpha;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(image.width, 0);
  ihdr.writeUInt32BE(image.height, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(rows)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

module.exports = { parseXcursor, xcursorImageToPng };
