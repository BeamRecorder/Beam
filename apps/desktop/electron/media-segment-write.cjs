// Acknowledge IPC only after the entire chunk reaches the file. A synchronous
// write blocks the Electron main thread, including the recording Stop button.
async function writeMediaChunk(fsModule, job, data) {
  let offset = 0;
  while (offset < data.byteLength) {
    if (job.aborted) throw new Error('Recording write was cancelled.');
    const remaining = data.byteLength - offset;
    const written = await new Promise((resolve, reject) => {
      fsModule.write(job.handle, data, offset, remaining, job.position, (error, bytesWritten) => {
        if (error) reject(error);
        else resolve(bytesWritten);
      });
    });
    if (!Number.isSafeInteger(written) || written <= 0 || written > remaining)
      throw new Error('Recording file write made no valid progress.');
    offset += written;
    job.position += written;
  }
  if (job.aborted) throw new Error('Recording write was cancelled.');
}

module.exports = { writeMediaChunk };
