import { AppError } from '../utils/response.js';

export const notFound = (req, _res, next) => {
  next(new AppError(404, 'NOT_FOUND', `Route not found: ${req.method} ${req.path}`));
};

// Express recognises error handlers by their 4 arguments; keep `_next`.
// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, _req, res, _next) => {
  const known = err instanceof AppError;
  const status = known ? err.status : 500;

  // The API can be deployed before its database migrations. PostgreSQL reports
  // missing tables/columns as 42P01/42703; return an actionable, safe message
  // instead of exposing raw SQL details (or a generic internal error).
  if (err.code === '42P01' || err.code === '42703') {
    console.error('Database schema is behind the application code:', err.message);
    return res.status(503).json({
      success: false,
      error: {
        code: 'SCHEMA_NOT_READY',
        message: 'The database schema is out of date. Run the latest database migrations, then restart the API.',
      },
    });
  }

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

  // Log only safe metadata. Error objects can contain request bodies, which
  // may include passwords, reset tokens, or other sensitive values.
  if (!known) console.error('Unhandled API error', { name: err?.name, code: err?.code });

  return res.status(status).json({
    success: false,
    error: {
      code: known ? err.code : 'INTERNAL_ERROR',
      message: known ? err.message : 'Something went wrong.',
      ...(known && err.details ? { details: err.details } : {}),
    },
  });
};
