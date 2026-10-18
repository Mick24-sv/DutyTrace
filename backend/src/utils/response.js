// Consistent API response shape:
//   success: { success: true, data: ... }
//   failure: { success: false, error: { code, message, details? } }

export const ok = (res, data, status = 200) =>
  res.status(status).json({ success: true, data });

export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// Express 4 does not catch errors from async handlers by itself; this wrapper does.
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
