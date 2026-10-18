import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { AppError } from '../src/utils/response.js';

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

describe('safe API error responses', () => {
  test('unknown internal errors do not expose messages outside production either', () => {
    const res = responseRecorder();
    const oldError = console.error;
    console.error = () => {};
    try {
      errorHandler(new Error('select * from users where password = secret'), {}, res, () => {});
    } finally {
      console.error = oldError;
    }

    assert.equal(res.statusCode, 500);
    assert.equal(res.body.error.code, 'INTERNAL_ERROR');
    assert.equal(res.body.error.message, 'Something went wrong.');
    assert.ok(!JSON.stringify(res.body).includes('password'));
  });

  test('missing schema errors return migration guidance without raw SQL details', () => {
    const res = responseRecorder();
    const oldError = console.error;
    console.error = () => {};
    try {
      errorHandler(Object.assign(new Error('relation "notifications" does not exist'), { code: '42P01' }), {}, res, () => {});
    } finally {
      console.error = oldError;
    }

    assert.equal(res.statusCode, 503);
    assert.equal(res.body.error.code, 'SCHEMA_NOT_READY');
    assert.match(res.body.error.message, /migrations/i);
    assert.ok(!JSON.stringify(res.body).includes('notifications'));
  });

  test('malformed request bodies are rejected without logging their contents', () => {
    const res = responseRecorder();
    const logged = [];
    const oldError = console.error;
    console.error = (...args) => logged.push(args);
    try {
      errorHandler(Object.assign(new Error('invalid body: password=secret-value'), { type: 'entity.parse.failed', body: { password: 'secret-value' } }), {}, res, () => {});
    } finally {
      console.error = oldError;
    }

    assert.equal(res.statusCode, 400);
    assert.equal(logged.length, 0);
    assert.ok(!JSON.stringify(logged).includes('secret-value'));
  });

  test('known validation and authorization errors retain their safe messages', () => {
    const res = responseRecorder();
    errorHandler(new AppError(403, 'FORBIDDEN', 'You do not have permission to do that.'), {}, res, () => {});
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.error.message, 'You do not have permission to do that.');
  });
});
