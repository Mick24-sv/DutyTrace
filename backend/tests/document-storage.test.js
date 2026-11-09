import { it } from 'node:test';
import assert from 'node:assert/strict';
import { env } from '../src/config/env.js';
import { validateUpload } from '../src/modules/documents/files.js';
import { putFile } from '../src/modules/documents/storage.js';

it('uploads supported files to a MIME-restricted private bucket', async (t) => {
  const original = { ...env };
  t.after(() => Object.assign(env, original));
  Object.assign(env, {
    documentStorage: 'supabase',
    supabaseUrl: 'https://storage.example.test',
    supabaseSecretKey: 'sb_secret_test',
    supabaseStorageBucket: 'dutytrace-documents',
  });
  const allowed = ['application/pdf', 'image/png', 'image/jpeg'];
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    assert.equal(options.headers.apikey, 'sb_secret_test');
    assert.equal(options.headers.authorization, undefined);
    return new Response(null, { status: allowed.includes(options.headers['content-type']) ? 200 : 415 });
  });
  for (const [name, buffer] of [
    ['letter.pdf', Buffer.from('%PDF-1.7')],
    ['photo.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
    ['photo.jpg', Buffer.from([0xff, 0xd8, 0xff])],
  ]) {
    const meta = validateUpload(buffer, name, 1024);
    const stored = await putFile(buffer, meta.mime);
    assert.match(stored.storedName, /^[0-9a-f-]{36}$/);
  }
});
