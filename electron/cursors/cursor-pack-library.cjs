const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { DOMParser } = require('@xmldom/xmldom');
const { parseXcursor, xcursorImageToPng } = require('./xcursor-parser.cjs');

const MAX_ROLES = 256;
const MAX_SVG_BYTES = 2 * 1024 * 1024;
const MAX_PACK_BYTES = 32 * 1024 * 1024;
const MAX_XML_NODES = 10_000;
const MAX_XCURSOR_BYTES = 8 * 1024 * 1024;
const DEFAULT_ROLES = ['default', 'left_ptr', 'arrow'];
const ALLOWED_ELEMENTS = new Set([
  'svg',
  'g',
  'path',
  'circle',
  'ellipse',
  'rect',
  'line',
  'polyline',
  'polygon',
  'defs',
  'linearGradient',
  'radialGradient',
  'stop',
  'clipPath',
  'mask',
  'use',
  'title',
  'desc',
  'symbol',
  'pattern',
]);

const within = (root, target) => target === root || target.startsWith(`${root}${path.sep}`);
const finitePositive = (value) => typeof value === 'number' && Number.isFinite(value) && value > 0;
const numericDimension = (value) => {
  if (typeof value !== 'string' || !/^\s*(?:\d+(?:\.\d+)?|\.\d+)\s*$/.test(value)) return null;
  const parsed = Number(value);
  return finitePositive(parsed) ? parsed : null;
};

function assertPackSize(root) {
  const visited = new Set();
  let bytes = 0;
  const visit = (candidate) => {
    const real = fs.realpathSync(candidate);
    if (!within(root, real)) throw new Error('Lien symbolique externe interdit');
    if (visited.has(real)) return;
    visited.add(real);
    const stat = fs.statSync(real);
    if (stat.isFile()) {
      bytes += stat.size;
      if (bytes > MAX_PACK_BYTES) throw new Error('Le pack dépasse la limite de 32 Mio');
      return;
    }
    if (stat.isDirectory()) for (const name of fs.readdirSync(real)) visit(path.join(real, name));
  };
  visit(root);
}

function themeName(themeRoot, scalableRoot) {
  for (const file of [path.join(themeRoot, 'index.theme'), path.join(scalableRoot, 'index.theme')]) {
    try {
      const match = /^Name\s*=\s*(.+)$/m.exec(fs.readFileSync(file, 'utf8'));
      if (match?.[1]?.trim()) return match[1].trim();
    } catch {}
  }
  return path.basename(themeRoot);
}

function countNodes(node) {
  let count = 1;
  for (let child = node.firstChild; child; child = child.nextSibling) {
    count += countNodes(child);
    if (count > MAX_XML_NODES) break;
  }
  return count;
}

function validateSvg(svg, role) {
  if (/<!DOCTYPE|<!ENTITY|<\?(?!xml\b)/i.test(svg))
    throw new Error(`Curseur ${role}: DOCTYPE, entités et instructions de traitement interdits`);
  const errors = [];
  const document = new DOMParser({
    errorHandler: {
      warning: (message) => errors.push(message),
      error: (message) => errors.push(message),
      fatalError: (message) => errors.push(message),
    },
  }).parseFromString(svg, 'image/svg+xml');
  if (errors.length || !document.documentElement || document.documentElement.localName !== 'svg')
    throw new Error(`Curseur ${role}: XML SVG invalide`);
  if (countNodes(document) > MAX_XML_NODES) throw new Error(`Curseur ${role}: plus de ${MAX_XML_NODES} nœuds XML`);

  let tintable = true;
  const visit = (element) => {
    if (element.nodeType !== 1) return;
    const name = element.localName;
    if (!ALLOWED_ELEMENTS.has(name)) throw new Error(`Curseur ${role}: élément SVG interdit (${name})`);
    for (let index = 0; index < element.attributes.length; index += 1) {
      const attribute = element.attributes.item(index);
      const attributeName = attribute.name.toLowerCase();
      const value = attribute.value.trim();
      if (attributeName.startsWith('on')) throw new Error(`Curseur ${role}: gestionnaire d’événement interdit`);
      if ((attributeName === 'href' || attributeName.endsWith(':href')) && value && !value.startsWith('#'))
        throw new Error(`Curseur ${role}: ressource externe interdite`);
      const namespaceDeclaration = attributeName === 'xmlns' || attributeName.startsWith('xmlns:');
      if (!namespaceDeclaration && (/url\(\s*['"]?(?!#)/i.test(value) || /(?:https?|file|data):/i.test(value)))
        throw new Error(`Curseur ${role}: ressource externe interdite`);
      if (attributeName === 'style') {
        if (/url\s*\(/i.test(value)) throw new Error(`Curseur ${role}: ressource CSS interdite`);
        for (const match of value.matchAll(/(?:fill|stroke)\s*:\s*([^;]+)/gi)) {
          if (!isTintColor(match[1])) tintable = false;
        }
      }
      if (
        (attributeName === 'fill' || attributeName === 'stroke' || attributeName === 'stop-color') &&
        !isTintColor(value)
      )
        tintable = false;
    }
    for (let child = element.firstChild; child; child = child.nextSibling) visit(child);
  };
  visit(document.documentElement);

  const viewBox = document.documentElement.getAttribute('viewBox');
  let width;
  let height;
  if (viewBox) {
    const parts = viewBox
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part)) || parts[2] <= 0 || parts[3] <= 0)
      throw new Error(`Curseur ${role}: viewBox invalide`);
    width = parts[2];
    height = parts[3];
  } else {
    width = numericDimension(document.documentElement.getAttribute('width'));
    height = numericDimension(document.documentElement.getAttribute('height'));
    if (!width || !height) throw new Error(`Curseur ${role}: dimensions numériques ou viewBox requis`);
    document.documentElement.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg = document.toString();
  }
  return { svg, width, height, tintable, hasCurrentColor: /currentColor/i.test(svg) };
}

function isTintColor(value) {
  return /^(?:currentcolor|none|transparent|#(?:000|000000|fff|ffffff)|black|white)$/i.test(String(value).trim());
}

function resolveImportRoot(selected, allowNested = true) {
  if (fs.lstatSync(selected).isSymbolicLink()) throw new Error('Lien symbolique de pack externe interdit');
  const root = fs.realpathSync(selected);
  if (!fs.statSync(root).isDirectory()) throw new Error('Le pack de curseurs doit être un dossier');
  if (path.basename(root) === 'cursors_scalable')
    return { themeRoot: path.dirname(root), assetRoot: root, kind: 'svg' };
  if (path.basename(root) === 'cursors') return { themeRoot: path.dirname(root), assetRoot: root, kind: 'xcursor' };
  const scalable = path.join(root, 'cursors_scalable');
  if (fs.existsSync(scalable) && fs.statSync(scalable).isDirectory()) {
    const assetRoot = fs.realpathSync(scalable);
    if (!within(root, assetRoot)) throw new Error('Lien symbolique cursors_scalable externe interdit');
    return { themeRoot: root, assetRoot, kind: 'svg' };
  }
  const cursors = path.join(root, 'cursors');
  if (fs.existsSync(cursors) && fs.statSync(cursors).isDirectory()) {
    const assetRoot = fs.realpathSync(cursors);
    if (!within(root, assetRoot)) throw new Error('Lien symbolique cursors externe interdit');
    return { themeRoot: root, assetRoot, kind: 'xcursor' };
  }
  if (allowNested) {
    const candidates = fs
      .readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(root, entry.name))
      .filter(
        (directory) =>
          fs.existsSync(path.join(directory, 'cursors_scalable')) || fs.existsSync(path.join(directory, 'cursors')),
      );
    if (candidates.length === 1) return resolveImportRoot(candidates[0], false);
    if (candidates.length > 1)
      throw new Error('Plusieurs thèmes trouvés. Sélectionnez le dossier du thème à importer.');
  }
  throw new Error('Aucun dossier cursors_scalable ou cursors compatible trouvé');
}

function readRole(scalableRoot, roleEntry) {
  const rolePath = path.join(scalableRoot, roleEntry.name);
  const realRole = fs.realpathSync(rolePath);
  if (!within(scalableRoot, realRole)) throw new Error(`Rôle ${roleEntry.name}: lien symbolique externe interdit`);
  if (!fs.statSync(realRole).isDirectory()) return null;
  const metadataPath = path.join(realRole, 'metadata.json');
  const realMetadata = fs.realpathSync(metadataPath);
  if (!within(scalableRoot, realMetadata)) throw new Error(`Rôle ${roleEntry.name}: metadata externe interdite`);
  const metadataBytes = fs.statSync(realMetadata).size;
  if (metadataBytes > MAX_PACK_BYTES) throw new Error(`Rôle ${roleEntry.name}: metadata.json trop volumineux`);
  const frames = JSON.parse(fs.readFileSync(realMetadata, 'utf8'));
  if (!Array.isArray(frames) || frames.length === 0) throw new Error(`Rôle ${roleEntry.name}: metadata.json invalide`);
  if (frames.length > 1 || frames[0]?.delay !== undefined) return { animated: true, role: roleEntry.name };
  const frame = frames[0];
  if (
    !frame ||
    typeof frame.filename !== 'string' ||
    path.basename(frame.filename) !== frame.filename ||
    path.extname(frame.filename).toLowerCase() !== '.svg'
  )
    throw new Error(`Rôle ${roleEntry.name}: référence SVG invalide`);
  if (
    !finitePositive(frame.nominal_size) ||
    !Number.isFinite(frame.hotspot_x) ||
    !Number.isFinite(frame.hotspot_y) ||
    frame.hotspot_x < 0 ||
    frame.hotspot_y < 0
  )
    throw new Error(`Rôle ${roleEntry.name}: taille nominale ou hotspot invalide`);
  const svgPath = path.join(realRole, frame.filename);
  const realSvg = fs.realpathSync(svgPath);
  if (!within(scalableRoot, realSvg) || path.extname(realSvg).toLowerCase() !== '.svg')
    throw new Error(`Rôle ${roleEntry.name}: chemin SVG hors du pack`);
  const stat = fs.statSync(realSvg);
  if (!stat.isFile() || stat.size > MAX_SVG_BYTES) throw new Error(`Rôle ${roleEntry.name}: SVG trop volumineux`);
  const validated = validateSvg(fs.readFileSync(realSvg, 'utf8'), roleEntry.name);
  if (frame.hotspot_x > validated.width || frame.hotspot_y > validated.height)
    throw new Error(`Rôle ${roleEntry.name}: hotspot hors des dimensions SVG`);
  return {
    animated: false,
    role: roleEntry.name,
    contents: Buffer.from(validated.svg),
    format: 'svg',
    width: validated.width,
    height: validated.height,
    nominalSize: frame.nominal_size,
    hotspot: { x: frame.hotspot_x, y: frame.hotspot_y },
    tintable: validated.tintable,
    bytes: stat.size + metadataBytes,
  };
}

function readXcursorRole(cursorsRoot, roleEntry) {
  const rolePath = path.join(cursorsRoot, roleEntry.name);
  const realRole = fs.realpathSync(rolePath);
  if (!within(cursorsRoot, realRole)) throw new Error(`Rôle ${roleEntry.name}: lien symbolique externe interdit`);
  const stat = fs.statSync(realRole);
  if (!stat.isFile()) return null;
  if (stat.size > MAX_XCURSOR_BYTES) throw new Error(`Rôle ${roleEntry.name}: fichier XCursor trop volumineux`);
  const source = fs.readFileSync(realRole);
  const parsed = parseXcursor(source);
  if (parsed.animated) return { animated: true, role: roleEntry.name, source, bytes: source.length };
  const image = parsed.image;
  return {
    animated: false,
    role: roleEntry.name,
    contents: xcursorImageToPng(image),
    format: 'png',
    width: image.width,
    height: image.height,
    nominalSize: image.nominalSize,
    hotspot: image.hotspot,
    tintable: false,
    bytes: source.length,
    source,
  };
}

function createCursorPackLibrary(root) {
  const libraryRoot = path.resolve(root);
  const manifestFor = (directory) => JSON.parse(fs.readFileSync(path.join(directory, 'pack.json'), 'utf8'));
  const list = () => {
    try {
      return fs
        .readdirSync(libraryRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && /^[a-f0-9]{64}$/.test(entry.name))
        .map((entry) => manifestFor(path.join(libraryRoot, entry.name)))
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch {
      return [];
    }
  };

  const importDirectory = (selected) => {
    const { themeRoot, assetRoot, kind } = resolveImportRoot(selected);
    if (kind === 'svg') assertPackSize(assetRoot);
    const roleEntries = fs
      .readdirSync(assetRoot, { withFileTypes: true })
      .filter((entry) =>
        kind === 'svg' ? entry.isDirectory() || entry.isSymbolicLink() : entry.isFile() || entry.isSymbolicLink(),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
    if (roleEntries.length > MAX_ROLES) throw new Error(`Le pack dépasse la limite de ${MAX_ROLES} rôles`);
    const roles = [];
    const uniqueSources = new Set();
    let totalSourceBytes = 0;
    for (const entry of roleEntries) {
      const role = kind === 'svg' ? readRole(assetRoot, entry) : readXcursorRole(assetRoot, entry);
      if (!role) continue;
      if (kind === 'xcursor') {
        const sourceHash = crypto.createHash('sha256').update(role.source).digest('hex');
        if (!uniqueSources.has(sourceHash)) {
          uniqueSources.add(sourceHash);
          totalSourceBytes += role.bytes;
          if (totalSourceBytes > MAX_PACK_BYTES) throw new Error('Le pack dépasse la limite de 32 Mio');
        }
      }
      roles.push(role);
    }
    const animated = roles.filter((role) => role.animated).map((role) => role.role);
    const staticRoles = roles.filter((role) => !role.animated);
    if (!DEFAULT_ROLES.some((role) => staticRoles.some((entry) => entry.role === role)))
      throw new Error('Le pack doit contenir un curseur statique default, left_ptr ou arrow');
    const hash = crypto.createHash('sha256');
    for (const role of staticRoles)
      hash
        .update(role.role)
        .update('\0')
        .update(role.contents)
        .update('\0')
        .update(JSON.stringify({ nominalSize: role.nominalSize, hotspot: role.hotspot }));
    const id = hash.digest('hex');
    fs.mkdirSync(libraryRoot, { recursive: true });
    const target = path.join(libraryRoot, id);
    if (fs.existsSync(target)) {
      const pack = manifestFor(target);
      return { pack, importedCount: pack.cursors.length, ignoredAnimatedRoles: animated, duplicate: true };
    }
    const temporary = fs.mkdtempSync(path.join(libraryRoot, '.import-'));
    try {
      const cursors = staticRoles.map((role, index) => {
        const assetId = `${String(index).padStart(3, '0')}-${role.role.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
        fs.writeFileSync(path.join(temporary, `${assetId}.${role.format}`), role.contents);
        return {
          id: role.role,
          label: role.role.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()),
          url: `project-media://cursor/${id}/${assetId}`,
          format: role.format,
          tintable: role.tintable,
          intrinsicSize: { width: role.width, height: role.height },
          nominalSize: role.nominalSize,
          hotspot: role.hotspot,
        };
      });
      const defaultCursorId = DEFAULT_ROLES.find((role) => cursors.some((cursor) => cursor.id === role));
      const pack = {
        id,
        name: themeName(themeRoot, assetRoot),
        source: 'imported',
        colorMode: staticRoles.every((role) => role.tintable) ? 'tintable' : 'original',
        defaultCursorId,
        cursors,
        automaticMap: Object.fromEntries(cursors.map((cursor) => [cursor.id, cursor.id])),
      };
      fs.writeFileSync(path.join(temporary, 'pack.json'), `${JSON.stringify(pack, null, 2)}\n`, 'utf8');
      fs.renameSync(temporary, target);
      return { pack, importedCount: cursors.length, ignoredAnimatedRoles: animated, duplicate: false };
    } catch (error) {
      fs.rmSync(temporary, { recursive: true, force: true });
      throw error;
    }
  };

  const fileForUrl = (rawUrl) => {
    try {
      const url = new URL(rawUrl);
      if (url.protocol !== 'project-media:' || url.hostname !== 'cursor' || url.search || url.hash) return null;
      const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
      if (parts.length !== 2 || !/^[a-f0-9]{64}$/.test(parts[0]) || !/^\d{3}-[a-zA-Z0-9_-]+$/.test(parts[1]))
        return null;
      const packRoot = path.join(libraryRoot, parts[0]);
      const manifest = manifestFor(packRoot);
      const asset = manifest.cursors?.find((cursor) => cursor.url === rawUrl);
      if (!asset || (asset.format !== undefined && asset.format !== 'svg' && asset.format !== 'png')) return null;
      const file = path.join(packRoot, `${parts[1]}.${asset.format ?? 'svg'}`);
      const realRoot = fs.realpathSync(packRoot);
      const realFile = fs.realpathSync(file);
      return within(realRoot, realFile) && fs.statSync(realFile).isFile() ? realFile : null;
    } catch {
      return null;
    }
  };
  return { list, importDirectory, fileForUrl };
}

module.exports = { createCursorPackLibrary, validateSvg };
