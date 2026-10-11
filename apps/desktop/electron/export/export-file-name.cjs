function safeExportName(name, extension) {
  const base = typeof name === 'string' ? name.normalize('NFKC').trim() : '';
  const cleaned = base
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .slice(0, 120);
  return `${cleaned || 'Beam export'}.${extension}`;
}

module.exports = { safeExportName };
