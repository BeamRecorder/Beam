const fs = require('node:fs');

const MACHINES = Object.freeze({ x64: 0x8664, arm64: 0xaa64 });

function peMachine(file) {
  const bytes = fs.readFileSync(file);
  if (bytes.length < 64 || bytes.toString('ascii', 0, 2) !== 'MZ') throw new Error(`${file} is not a PE executable`);
  const peOffset = bytes.readUInt32LE(0x3c);
  if (peOffset + 6 > bytes.length || bytes.toString('ascii', peOffset, peOffset + 4) !== 'PE\0\0') {
    throw new Error(`${file} has no valid PE header`);
  }
  return bytes.readUInt16LE(peOffset + 4);
}

function verifyPe(file, expectedArch) {
  const expected = MACHINES[expectedArch];
  if (!expected) throw new Error(`Unknown PE architecture ${expectedArch}`);
  const actual = peMachine(file);
  if (actual !== expected) throw new Error(`${file} has PE machine 0x${actual.toString(16)}; expected ${expectedArch}`);
}

if (require.main === module) {
  try {
    const [expectedArch, ...files] = process.argv.slice(2);
    if (!expectedArch || files.length === 0)
      throw new Error('Usage: node scripts/release/verify-pe.cjs <x64|arm64> <file...>');
    for (const file of files) verifyPe(file, expectedArch);
    console.log(`Verified ${files.length} ${expectedArch} PE executable(s)`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { MACHINES, peMachine, verifyPe };
