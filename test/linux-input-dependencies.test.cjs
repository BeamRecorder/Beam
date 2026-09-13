const assert = require('node:assert/strict');
const test = require('node:test');

const { build } = require('../package.json');

function packageDependencies(configuration) {
  const dependencies = [];
  for (let index = 0; index < configuration.fpm.length; index += 1) {
    if (configuration.fpm[index] === '--depends') {
      dependencies.push(configuration.fpm[index + 1]);
      index += 1;
    }
  }
  return dependencies;
}

test('Deb and RPM packages declare the Linux input authorization dependency', () => {
  const debDependencies = packageDependencies(build.deb);
  const rpmDependencies = packageDependencies(build.rpm);

  assert.deepEqual([...debDependencies].sort(), ['pkexec', 'wl-clipboard', 'xclip'].sort());
  assert.deepEqual([...rpmDependencies].sort(), ['polkit', 'wl-clipboard', 'xclip'].sort());
});
