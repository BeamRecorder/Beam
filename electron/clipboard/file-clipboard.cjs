const { spawn: spawnProcess } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const COPY_TIMEOUT_MS = 10_000;
// Paths are input data, never interpolated into PowerShell source. SetFileDropList
// publishes the actual FileDrop format and flushes it before the process exits.
const WINDOWS_COPY_SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  'Add-Type -AssemblyName System.Windows.Forms',
  '$file = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String([Console]::In.ReadToEnd()))',
  '$files = New-Object System.Collections.Specialized.StringCollection',
  '[void]$files.Add($file)',
  '[System.Windows.Forms.Clipboard]::SetFileDropList($files)',
].join('\n');

function createFileClipboard({ platform = process.platform, env = process.env, clipboard, spawn = spawnProcess }) {
  const publish = (command, args, input) =>
    new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        env,
        windowsHide: true,
        detached: platform === 'linux',
        stdio: ['pipe', 'ignore', 'pipe'],
      });
      let settled = false;
      let diagnostic = '';
      const finish = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        child.stdin.destroy();
        child.stderr.destroy();
        if (error) reject(error);
        else resolve();
      };
      const timer = setTimeout(() => {
        child.kill();
        finish(new Error(`Clipboard publication with ${command} timed out.`));
      }, COPY_TIMEOUT_MS);
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (text) => {
        diagnostic = (diagnostic + text).slice(0, 4096);
      });
      child.once('error', (error) =>
        finish(
          new Error(
            error.code === 'ENOENT'
              ? `Clipboard publication requires ${command}. Install ${command === 'wl-copy' ? 'wl-clipboard' : command}.`
              : `Clipboard publication failed: ${error.message}`,
          ),
        ),
      );
      child.stdin.on('error', (error) => finish(new Error(`Clipboard input failed: ${error.message}`)));
      // Linux tools fork after acquiring the selection. Their background owner
      // keeps serving repeated pastes until another application replaces it.
      // Waiting for 'close' would wait for that owner's inherited stderr forever.
      child.once('exit', (code, signal) =>
        finish(code === 0 ? null : new Error(`Clipboard publication failed (${signal ?? code}): ${diagnostic.trim()}`)),
      );
      child.stdin.end(input);
    });

  return {
    async copyFile(file) {
      if (typeof file !== 'string' || !file || file.includes('\0')) throw new Error('Invalid clipboard file.');
      if (platform === 'darwin') {
        clipboard.writeBuffer('public.file-url', Buffer.from(pathToFileURL(file).href));
      } else if (platform === 'win32') {
        await publish(
          'powershell.exe',
          ['-NoProfile', '-NonInteractive', '-STA', '-Command', WINDOWS_COPY_SCRIPT],
          Buffer.from(file, 'utf8').toString('base64'),
        );
      } else if (platform === 'linux') {
        const data = `${pathToFileURL(file).href}\r\n`;
        if (env.WAYLAND_DISPLAY) await publish('wl-copy', ['--type', 'text/uri-list'], data);
        else if (env.DISPLAY)
          await publish('xclip', ['-selection', 'clipboard', '-target', 'text/uri-list', '-in', '-silent'], data);
        else throw new Error('Clipboard publication requires a Wayland or X11 session.');
      } else throw new Error(`File clipboard is unavailable on ${platform}.`);
      return { native: true, fallback: null };
    },
  };
}

module.exports = { createFileClipboard };
