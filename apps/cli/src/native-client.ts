import { NativeCaptureClient } from '@beam/native-client';
import { resolveCargoTargetDirectory } from '@beam/native-client/cargo-build-paths';
import { access, mkdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applicationPaths } from '@beam/storage/node/platform-paths';
export async function createNativeClient() {
  const root = process.env.BEAM_APPLICATION_ROOT ?? fileURLToPath(new URL('../../../', import.meta.url));
  const version = process.env.BEAM_APP_VERSION ?? '0.5.0';
  const extension = process.platform === 'win32' ? '.exe' : '';
  const platform = process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'win' : 'linux';
  const candidates = process.env.BEAM_CAPTURE_ENGINE
    ? [process.env.BEAM_CAPTURE_ENGINE]
    : [
        ...(process.env.BEAM_RESOURCES_PATH
          ? [join(process.env.BEAM_RESOURCES_PATH, 'capture-engine', `capture-engine-${version}${extension}`)]
          : []),
        join(root, 'packages', 'native-recorder', platform, process.arch, `capture-engine-${version}${extension}`),
        join(root, 'target', 'debug', `capture-engine${extension}`),
      ];
  let executable: string | undefined;
  for (const path of candidates) {
    try {
      await access(path, constants.X_OK);
      executable = path;
      break;
    } catch {
      /* Try the next explicit installation location. */
    }
  }
  if (!executable && !process.env.BEAM_CAPTURE_ENGINE && !process.env.BEAM_RESOURCES_PATH) {
    const target = resolveCargoTargetDirectory(root);
    for (const profile of ['debug', 'release']) {
      const candidate = join(target, profile, `capture-engine${extension}`);
      candidates.push(candidate);
      try {
        await access(candidate, constants.X_OK);
        executable = candidate;
        break;
      } catch {
        /* Check the next explicitly resolved build profile. */
      }
    }
  }
  if (!executable)
    throw new Error(`Native capture backend unavailable. Set BEAM_CAPTURE_ENGINE. Checked: ${candidates.join(', ')}`);
  const data = applicationPaths().data;
  await mkdir(data, { recursive: true });
  return new NativeCaptureClient({
    executable: () => executable!,
    workingDirectory: () => data,
    inputHelperPath: () => process.env.BEAM_INPUT_HELPER_PATH ?? null,
  });
}
