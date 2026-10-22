import { z } from 'zod';
import { AppError } from './response.js';

// Parse input with a Zod schema or throw a 400 with field-level messages.
export function parse(schema, input) {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const details = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || '_';
    details[key] ??= issue.message;
  }
  throw new AppError(400, 'VALIDATION_ERROR', 'Please check the highlighted fields.', details);
}

export const uuidSchema = z.string().uuid('Invalid id');
export const parseId = (value) => parse(uuidSchema, value);
