import express from 'express';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/response.js';

// Raw-body upload: the request body IS the file (no multipart parser to attack). Mount it AFTER the
// auth/role guards so anonymous callers never reach the body parser. Reads the limit on every request.
export const rawUpload = (req, res, next) =>
  express.raw({ type: () => true, limit: env.maxUploadBytes })(req, res, next);

// File name travels in ?filename= (display only; never used as a path).
export function uploadedFile(req) {
  const name = req.query.filename;
  if (typeof name !== 'string' || !name.trim() || name.length > 255) {
    throw new AppError(400, 'BAD_FILE_NAME', 'Add the file name as ?filename=...');
  }
  return { buffer: req.body, rawName: name };
}
