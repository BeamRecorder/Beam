import { open, link, rename, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { basename, dirname, join } from 'node:path';

/** One job owns one staged file. Random access preserves muxer header patches. */
export async function createBinaryOutput(destination: string, overwrite: boolean) {
  const temporary = join(dirname(destination), `.${basename(destination)}.${randomUUID()}.tmp`);
  const file = await open(temporary, 'wx');
  let closed = false;
  let finalized = false;
  return {
    async write(position: number, data: Uint8Array) {
      if (closed) throw new Error('Export output is closed.');
      if (!Number.isSafeInteger(position) || position < 0) throw new RangeError('Invalid output position.');
      let offset = 0;
      while (offset < data.length) {
        const { bytesWritten } = await file.write(data, offset, data.length - offset, position + offset);
        if (!bytesWritten) throw new Error('Export write made no progress.');
        offset += bytesWritten;
      }
    },
    async finalize() {
      if (closed) throw new Error('Export output is closed.');
      await file.sync();
      await file.close();
      closed = true;
      if (overwrite) await rename(temporary, destination);
      else {
        await link(temporary, destination);
        await unlink(temporary);
      }
      finalized = true;
      return { path: destination };
    },
    async abort() {
      if (!closed) {
        await file.close();
        closed = true;
      }
      if (!finalized)
        await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== 'ENOENT') throw error;
        });
    },
  };
}
