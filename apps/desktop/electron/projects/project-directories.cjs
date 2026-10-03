const fs = require('node:fs');
const path = require('node:path');

function listProjectDirectories(root, category) {
  const roots = category ? ['studio', 'instant'].map((name) => path.join(root, name)) : [root];
  return roots.flatMap((directory) =>
    !fs.existsSync(directory)
      ? []
      : fs
          .readdirSync(directory, { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => path.join(directory, entry.name))
          .filter((entry) => fs.existsSync(path.join(entry, 'project.json'))),
  );
}
module.exports = { listProjectDirectories };
