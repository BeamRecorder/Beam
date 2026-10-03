const { createHash } = require('node:crypto');
const path = require('node:path');

function developmentSessionId(applicationRoot, name = 'default') {
  if (!/^[a-z0-9][a-z0-9_-]{0,39}$/.test(name))
    throw new Error('Development session must contain 1–40 lowercase letters, digits, underscores or hyphens.');
  const digest = createHash('sha256').update(path.resolve(applicationRoot)).digest('hex').slice(0, 16);
  return `${digest}-${name}`;
}

function developmentOrigin(env = process.env) {
  const url = new URL(env.BEAM_DEV_SERVER_URL ?? 'http://localhost:6500');
  if (
    url.protocol !== 'http:' ||
    !['localhost', '127.0.0.1'].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error('BEAM_DEV_SERVER_URL must be a local HTTP origin.');
  return url.origin;
}

function developmentRendererUrl(entry, env = process.env) {
  return `${developmentOrigin(env)}/html/${entry}`;
}

module.exports = { developmentSessionId, developmentOrigin, developmentRendererUrl };
