import type { ExportRequest } from '@beam/encoder';
import type { ExportRuntimeDiagnostics } from '@beam/encoder/export-diagnostics-types';
import { bitrateFor } from '@beam/encoder/export-presets';
import { createBinaryOutput } from '@beam/storage/node/binary-output';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, rm, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { registerLocalAssets } from './local-assets';
import { buildRenderBundle } from './render-bundle';
import { serveRenderBundle } from './bundle-server';
import { serveRegisteredAsset } from './asset-server';
import { ffmpegHostPaths } from './ffmpeg-host-paths';
import { runExportProcess } from './export-process';
import type { CliVideoExportResult } from './export-backend-types';

export async function exportWithFfmpeg(
  request: ExportRequest,
  directory: string,
  destination: string,
  overwrite: boolean,
): Promise<CliVideoExportResult> {
  const startedAt = new Date().toISOString();
  const paths = ffmpegHostPaths();
  for (const executable of [paths.executable, join(paths.nativeDirectory, 'beam-ffmpeg-export')])
    await access(executable, constants.X_OK);
  await access(join(paths.nativeDirectory, 'beam-gpu-transport.node'), constants.R_OK);
  const id = randomUUID();
  const assets = registerLocalAssets(request, directory, id);
  await mkdir(join(homedir(), '.cache'), { recursive: true });
  const temporary = await mkdtemp(join(homedir(), '.cache/beam-ffmpeg-cli-'));
  let output: Awaited<ReturnType<typeof createBinaryOutput>> | undefined;
  let server: Awaited<ReturnType<typeof serveRenderBundle>> | undefined;
  try {
    output = await createBinaryOutput(destination, overwrite);
    const bundle = await buildRenderBundle(join(temporary, 'bundle'));
    server = await serveRenderBundle(bundle, async (request, response, next) => {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      if (!url.pathname.startsWith('/beam-cli/')) return next();
      if (url.searchParams.get('auth') !== id) {
        response.writeHead(403).end();
        return;
      }
      try {
        if (!(await serveRegisteredAsset(url, request, response, assets.files))) response.writeHead(404).end();
      } catch (error) {
        response.writeHead(400).end(String(error));
      }
    });
    const config = join(temporary, 'host.json');
    const resultPath = join(temporary, 'result.json');
    await writeFile(
      config,
      JSON.stringify({
        ...paths,
        id,
        resultPath,
        profile: join(temporary, 'profile'),
        temporaryPath: output.temporaryPath,
        rendererUrl: `${server.origin}/gpu-export.html?auth=${id}`,
        request: {
          ...assets.request,
          nativeBitrate: bitrateFor(
            request.preset,
            request.snapshot.canvas.width,
            request.snapshot.canvas.height,
            request.snapshot.render.fps,
          ),
        },
      }),
      { mode: 0o600 },
    );
    const env: NodeJS.ProcessEnv = { ...process.env, TMPDIR: temporary };
    delete env.ELECTRON_RUN_AS_NODE;
    await runExportProcess(
      paths.executable,
      ['--ozone-platform=x11', paths.host, '--beam-gpu-export-host', config],
      env,
    );
    const diagnostics = JSON.parse(await readFile(resultPath, 'utf8')) as ExportRuntimeDiagnostics;
    if (
      diagnostics.videoEncoderImplementation !== 'ffmpeg-vaapi' ||
      diagnostics.encodedPacketCount !== Math.ceil(request.snapshot.duration * request.snapshot.render.fps)
    )
      throw new Error('The GPU host did not confirm a complete FFmpeg export.');
    const result = await output.finalize();
    return {
      ...result,
      format: request.format,
      diagnostics: {
        schemaVersion: 1,
        startedAt,
        completedAt: new Date().toISOString(),
        destinationDialogMs: 0,
        environment: null,
        runtime: diagnostics,
      },
    };
  } finally {
    try {
      await server?.close();
    } finally {
      try {
        await output?.abort();
      } finally {
        await rm(temporary, { recursive: true, force: true });
      }
    }
  }
}
