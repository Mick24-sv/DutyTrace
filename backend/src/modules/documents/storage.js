// Private file storage adapter. Local files are used in development/tests;
// production can use a private Supabase Storage bucket without public URLs.
// Files get a random UUID name with no extension, so a client-supplied name can never become a path,
// and nothing is ever served by a static route. Callers only deal with stored names.
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, unlink, writeFile, stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import path from 'node:path';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/response.js';

const NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const pathFor = (storedName) => {
  if (!NAME.test(storedName)) throw new Error('Invalid stored file name.');
  return path.join(env.uploadDir, storedName);
};

const isLocal = () => env.documentStorage !== 'supabase';
const objectPath = (storedName) =>
  `${env.supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/${encodeURIComponent(env.supabaseStorageBucket)}/${encodeURIComponent(storedName)}`;

async function storageRequest(url, options = {}) {
  let response;
  const headers = {
    apikey: env.supabaseSecretKey,
    ...options.headers,
  };
  // New sb_secret keys are opaque API keys, not JWTs; send them only as apikey.
  // Legacy service_role keys are JWTs and remain valid in Authorization.
  if (!env.supabaseSecretKey.startsWith('sb_secret_')) {
    headers.authorization = `Bearer ${env.supabaseSecretKey}`;
  }
  try {
    response = await fetch(url, {
      ...options,
      headers,
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new AppError(503, 'DOCUMENT_STORAGE_UNAVAILABLE', 'Private document storage is temporarily unavailable.');
  }
  return response;
}

export async function putFile(buffer) {
  const storedName = randomUUID();
  if (isLocal()) {
    await mkdir(env.uploadDir, { recursive: true, mode: 0o700 });
    // 'wx' = fail instead of overwrite; 0600 = owner only.
    await writeFile(pathFor(storedName), buffer, { flag: 'wx', mode: 0o600 });
  } else {
    const response = await storageRequest(objectPath(storedName), {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream', 'x-upsert': 'false' },
      body: buffer,
    });
    if (!response.ok) {
      throw new AppError(503, 'DOCUMENT_STORAGE_UNAVAILABLE', 'Private document storage rejected the upload.');
    }
  }
  return { storedName, sha256: createHash('sha256').update(buffer).digest('hex') };
}

export async function removeFile(storedName) {
  try {
    if (isLocal()) {
      await unlink(pathFor(storedName));
      return;
    }
    await storageRequest(`${env.supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/${encodeURIComponent(env.supabaseStorageBucket)}`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prefixes: [storedName] }),
    });
  } catch {
    // Cleanup is best effort; never replace the original database/upload error.
  }
}

export async function openFile(storedName) {
  if (isLocal()) {
    const file = pathFor(storedName);
    await stat(file); // throws ENOENT if missing
    return createReadStream(file);
  }
  const response = await storageRequest(objectPath(storedName));
  if (response.status === 404) {
    const error = new Error('Stored document is missing.');
    error.code = 'ENOENT';
    throw error;
  }
  if (!response.ok) {
    throw new AppError(503, 'DOCUMENT_STORAGE_UNAVAILABLE', 'Private document storage is temporarily unavailable.');
  }
  return Readable.from([Buffer.from(await response.arrayBuffer())]);
}
