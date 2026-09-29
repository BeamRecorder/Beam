import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';

/** Finds the GES development files needed by Cargo on Linux. */
export function nativeBuildEnvironment(inherited = process.env, options = {}) {
  const { platform = process.platform, home = homedir(), inspect = spawnSync, exists = existsSync } = options;
  if (platform !== 'linux') return inherited;

  const system = inspect('pkg-config', ['--variable=libdir', 'gst-editing-services-1.0'], {
    encoding: 'utf8',
    env: inherited,
  });
  if (system.status === 0 && exists(join(system.stdout.trim(), 'libges-1.0.so'))) return inherited;

  const runtime = inspect('rpm', ['-q', '--qf', '%{VERSION}-%{RELEASE}.%{ARCH}', 'gst-editing-services'], {
    encoding: 'utf8',
  });
  if (runtime.status !== 0 || !runtime.stdout?.trim()) {
    throw new Error(
      'GES development files are missing. Install the GES development package for this Linux distribution.',
    );
  }

  const version = runtime.stdout.trim();
  const sdk = join(home, '.cache/beam/ges-sdk', version, 'usr/lib64');
  if (!exists(join(sdk, 'pkgconfig/gst-editing-services-1.0.pc')) || !exists(join(sdk, 'libges-1.0.so'))) {
    throw new Error(`GES development files for ${version} are missing. On Fedora, install gst-editing-services-devel.`);
  }
  const environment = {
    ...inherited,
    PKG_CONFIG_PATH: [join(sdk, 'pkgconfig'), inherited.PKG_CONFIG_PATH].filter(Boolean).join(delimiter),
    LIBRARY_PATH: [sdk, inherited.LIBRARY_PATH].filter(Boolean).join(delimiter),
  };
  const packageVersion = inspect('pkg-config', ['--modversion', 'gst-editing-services-1.0'], {
    encoding: 'utf8',
    env: environment,
  });
  if (packageVersion.status !== 0 || packageVersion.stdout.trim() !== version.split('-')[0]) {
    throw new Error(`The cached GES development files do not match the installed ${version} runtime.`);
  }
  return environment;
}
