// Private file storage. The only code that touches the upload directory.
// Files get a random UUID name with no extension, so a client-supplied name can never become a path,
// and nothing in this directory is ever served by a static route. To use S3/Supabase Storage later,
// replace these functions; callers only deal with stored names.
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, unlink, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../../config/env.js';

const NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const pathFor = (storedName) => {
  if (!NAME.test(storedName)) throw new Error('Invalid stored file name.');
  return path.join(env.uploadDir, storedName);
};

export async function putFile(buffer) {
  await mkdir(env.uploadDir, { recursive: true, mode: 0o700 });
  const storedName = randomUUID();
  // 'wx' = fail instead of overwrite; 0600 = owner only.
  await writeFile(pathFor(storedName), buffer, { flag: 'wx', mode: 0o600 });
  return { storedName, sha256: createHash('sha256').update(buffer).digest('hex') };
}

export const removeFile = (storedName) => unlink(pathFor(storedName)).catch(() => {});

export async function openFile(storedName) {
  const file = pathFor(storedName);
  await stat(file); // throws ENOENT if missing
  return createReadStream(file);
}
