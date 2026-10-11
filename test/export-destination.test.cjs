const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const {
  exportFilePath,
  confirmExportReplacement,
  publishExportFile,
} = require('../apps/desktop/electron/export/export-destination.cjs');
const messages = require('../apps/desktop/shared/export-messages.json');
function fixture(locale = 'en') {
  const calls = [];
  let revision = null,
    response = 0;
  const stat = () => ({ dev: 1, ino: 2, size: 3, mtimeMs: revision, ctimeMs: 4, isFile: () => true });
  const services = {
    fsModule: {
      promises: {
        stat: async () => {
          if (revision === null) throw Object.assign(new Error('Not found'), { code: 'ENOENT' });
          return stat();
        },
      },
    },
    getLocale: () => locale,
    BrowserWindow: { fromWebContents: (sender) => sender.owner },
    dialog: {
      showMessageBox: async (owner, options) => {
        calls.push({ owner, options });
        return { response };
      },
    },
  };
  return {
    services,
    event: { sender: { owner: 'editor' } },
    calls,
    revision: (value) => {
      revision = value;
    },
    cancel: () => {
      response = 1;
    },
  };
}
test('resolves sanitized Unicode filenames inside the chosen native folder on each OS', () => {
  assert.equal(
    exportFilePath('/home/user/Téléchargements', '../Démo: final', 'webm', path.posix),
    '/home/user/Téléchargements/.. Démo final.webm',
  );
  assert.equal(
    exportFilePath('C:\\Users\\Test\\Videos', 'Demo<>', 'mp4', path.win32),
    'C:\\Users\\Test\\Videos\\Demo.mp4',
  );
  assert.equal(exportFilePath('/Users/test/Movies', 'Demo', 'png', path.posix), '/Users/test/Movies/Demo.png');
});
test('rejects absent directories instead of asking for a destination a second time', () => {
  for (const directory of [null, undefined, '', ' ', 123])
    assert.throws(() => exportFilePath(directory, 'Demo', 'mp4'), /Choose an export folder/);
});
test('requires no confirmation for a new file and never ignores filesystem failures or directories', async () => {
  const f = fixture();
  assert.deepEqual(await confirmExportReplacement(f.services, f.event, '/new.mp4'), { accepted: true, revision: null });
  assert.equal(f.calls.length, 0);
  f.services.fsModule.promises.stat = async () => {
    throw Object.assign(new Error('Denied'), { code: 'EACCES' });
  };
  await assert.rejects(confirmExportReplacement(f.services, f.event, '/denied.mp4'), /Denied/);
  f.services.fsModule.promises.stat = async () => ({ isFile: () => false });
  await assert.rejects(confirmExportReplacement(f.services, f.event, '/folder.mp4'), /not a file/);
});
test('owns confirmations to the originating editor, defaults to Cancel and reuses unchanged approval', async () => {
  const f = fixture('fr-FR');
  f.revision(1);
  const approval = await confirmExportReplacement(f.services, f.event, '/existing.mp4');
  assert.equal(approval.accepted, true);
  assert.equal(f.calls[0].owner, 'editor');
  assert.equal(f.calls[0].options.message, messages.fr.description);
  assert.deepEqual(f.calls[0].options.buttons, ['Remplacer', 'Annuler']);
  assert.equal(f.calls[0].options.defaultId, 1);
  assert.equal(f.calls[0].options.cancelId, 1);
  assert.equal(f.calls[0].options.detail, '/existing.mp4');
  await confirmExportReplacement(f.services, f.event, '/existing.mp4', approval.revision);
  assert.equal(f.calls.length, 1);
  f.revision(2);
  f.cancel();
  assert.equal(
    (await confirmExportReplacement(f.services, f.event, '/existing.mp4', approval.revision)).accepted,
    false,
  );
  assert.equal(f.calls.length, 2);
});
test('provides native replacement confirmations in all 15 languages and resolves locale variants', async () => {
  assert.equal(Object.keys(messages).length, 15);
  for (const locale of [...Object.keys(messages), 'pt_BR', 'zh_tw', 'unknown']) {
    const f = fixture(locale);
    f.revision(1);
    await confirmExportReplacement(f.services, f.event, '/existing.mp4');
    const text = messages[locale] ?? messages[{ pt_BR: 'pt-BR', zh_tw: 'zh-TW' }[locale]] ?? messages.en;
    assert.equal(f.calls[0].options.title, text.title);
    assert.equal(f.calls[0].options.message, text.description);
    assert.deepEqual(f.calls[0].options.buttons, [text.replace, text.cancel]);
    for (const value of Object.values(text)) assert.ok(value.length > 1);
  }
});
test('serializes competing publications and checks the second collision before replacing', async () => {
  const f = fixture();
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let secondPublished = false;
  const first = publishExportFile(f.services, f.event, '/same.mp4', null, async () => {
    await gate;
    f.revision(1);
  });
  const second = publishExportFile(f.services, f.event, '/same.mp4', null, async () => {
    secondPublished = true;
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(secondPublished, false);
  f.cancel();
  release();
  assert.equal(await first, true);
  assert.equal(await second, false);
  assert.equal(secondPublished, false);
  assert.equal(f.calls.length, 1);
});
test('a failed publication releases the queue so a later export can complete', async () => {
  const f = fixture();
  const first = publishExportFile(f.services, f.event, '/retry.mp4', null, async () => {
    throw new Error('Disk full');
  });
  const second = publishExportFile(f.services, f.event, '/retry.mp4', null, async () => {});
  await assert.rejects(first, /Disk full/);
  assert.equal(await second, true);
  assert.equal(await publishExportFile(f.services, f.event, '/retry.mp4', null, async () => {}), true);
});
