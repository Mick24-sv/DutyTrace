import { AppError } from '../utils/response.js';
import { isProduction } from '../config/env.js';

export const notFound = (req, _res, next) => {
  next(new AppError(404, 'NOT_FOUND', `Route not found: ${req.method} ${req.path}`));
};

// Express recognises error handlers by their 4 arguments; keep `_next`.
// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, _req, res, _next) => {
  const known = err instanceof AppError;
  const status = known ? err.status : 500;

  // Log full details on the server only; never leak stack traces to clients.
  if (!known) console.error(err);

  // Malformed JSON bodies are the client's mistake, not a server fault.
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      success: false,
      error: { code: 'BAD_JSON', message: 'Request body is not valid JSON.' },
    });
  }

  // Upload larger than the configured limit (body-parser).
  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      success: false,
      error: { code: 'FILE_TOO_LARGE', message: 'That file is larger than the allowed upload size.' },
    });
  }

  return res.status(status).json({
    success: false,
    error: {
      code: known ? err.code : 'INTERNAL_ERROR',
      message: known || !isProduction ? err.message : 'Something went wrong.',
      ...(known && err.details ? { details: err.details } : {}),
    },
  });
};
