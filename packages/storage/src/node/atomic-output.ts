import { open, link, rename, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { basename, dirname, join } from 'node:path';

export async function writeJsonOutput(destination: string, value: unknown, overwrite = false): Promise<void> {
  const data = JSON.stringify(value, null, 2) + '\n';
  const temporary = join(dirname(destination), `.${basename(destination)}.${randomUUID()}.tmp`);
  const file = await open(temporary, 'wx');
  try {
    await file.writeFile(data);
    await file.sync();
    await file.close();
    if (overwrite) await rename(temporary, destination);
    else {
      await link(temporary, destination);
      await unlink(temporary);
    }
  } finally {
    await file.close();
    await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
}
