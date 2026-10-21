import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  recordAudit,
  labelForAction,
  categoryForAction,
  listAuditEvents,
} from '../src/modules/audit/audit.service.js';

describe('Audit Trail service unit tests', () => {
  it('correctly maps known actions to human-readable labels', () => {
    assert.equal(labelForAction('auth.login'), 'Signed in');
    assert.equal(labelForAction('auth.account_locked'), 'Account locked');
    assert.equal(labelForAction('user.create'), 'User created');
    assert.equal(labelForAction('attendance.time_in'), 'Clocked in');
    assert.equal(labelForAction('attendance.time_out'), 'Clocked out');
    assert.equal(labelForAction('dtr.generate'), 'DTR generated');
    assert.equal(labelForAction('dtr.approve'), 'DTR approved');
    assert.equal(labelForAction('absence.submit'), 'Absence notice submitted');
    assert.equal(labelForAction('qr.generate'), 'QR code generated');
    assert.equal(labelForAction('institution.update'), 'Institution settings updated');
  });

  it('falls back to the raw action string for unknown action types', () => {
    assert.equal(labelForAction('custom.unknown_event'), 'custom.unknown_event');
  });

  it('derives correct action categories', () => {
    assert.equal(categoryForAction('auth.login'), 'auth');
    assert.equal(categoryForAction('auth.login_failed'), 'auth');
    assert.equal(categoryForAction('user.create'), 'users');
    assert.equal(categoryForAction('attendance.time_in'), 'attendance');
    assert.equal(categoryForAction('dtr.submit'), 'dtr');
    assert.equal(categoryForAction('absence.submit'), 'absences');
    assert.equal(categoryForAction('case.open'), 'cases');
    assert.equal(categoryForAction('qr.generate'), 'qr');
    assert.equal(categoryForAction('institution.update'), 'institution');
    assert.equal(categoryForAction('duty_requirement.create'), 'settings');
    assert.equal(categoryForAction('some_unmapped_action'), 'other');
  });

  it('records audit events with correct parameters and serialization', async () => {
    const executedQueries = [];
    const mockDb = {
      query: async (sql, params) => {
        executedQueries.push({ sql, params });
        return { rows: [] };
      },
    };

    const payload = {
      actorId: '11111111-1111-1111-1111-111111111111',
      institutionId: '99999999-9999-9999-9999-999999999999',
      action: 'user.update',
      targetType: 'user',
      targetId: '22222222-2222-2222-2222-222222222222',
      before: { fullName: 'Old Name', role: 'student' },
      after: { fullName: 'New Name', role: 'student' },
      ip: '192.168.1.1',
    };

    await recordAudit(payload, mockDb);

    assert.equal(executedQueries.length, 1);
    const { sql, params } = executedQueries[0];
    assert.match(sql, /INSERT INTO audit_logs/);
    assert.equal(params[0], payload.actorId);
    assert.equal(params[1], payload.institutionId);
    assert.equal(params[2], payload.action);
    assert.equal(params[3], payload.targetType);
    assert.equal(params[4], payload.targetId);
    assert.equal(params[5], JSON.stringify(payload.before));
    assert.equal(params[6], JSON.stringify(payload.after));
    assert.equal(params[7], payload.ip);
  });

  it('resolves actor institution when institutionId is omitted', async () => {
    const executedQueries = [];
    const mockDb = {
      query: async (sql, params) => {
        executedQueries.push({ sql, params });
        if (sql.includes('SELECT institution_id FROM users')) {
          return { rows: [{ institution_id: 'auto-resolved-institution-uuid' }] };
        }
        return { rows: [] };
      },
    };

    await recordAudit(
      {
        actorId: 'actor-uuid',
        action: 'auth.login',
        targetType: 'user',
        targetId: 'actor-uuid',
        ip: '127.0.0.1',
      },
      mockDb,
    );

    assert.equal(executedQueries.length, 2);
    // First query should look up the user's institution
    assert.match(executedQueries[0].sql, /SELECT institution_id FROM users/);
    // Second query should insert the resolved institution
    assert.match(executedQueries[1].sql, /INSERT INTO audit_logs/);
    assert.equal(executedQueries[1].params[1], 'auto-resolved-institution-uuid');
  });

  it('enforces institution scope and validates pagination in listAuditEvents', async () => {
    const executedQueries = [];
    const mockDb = {
      query: async (sql, params) => {
        executedQueries.push({ sql, params });
        if (sql.includes('COUNT(*)')) {
          return { rows: [{ total: '42' }] };
        }
        return {
          rows: [
            {
              id: '1',
              action: 'auth.login',
              target_type: 'user',
              target_id: 'user-1',
              before_data: null,
              after_data: null,
              ip_address: '127.0.0.1',
              created_at: new Date().toISOString(),
              actor_id: 'user-1',
              actor_name: 'Test Admin',
              actor_email: 'admin@school.edu',
              actor_role: 'admin',
            },
          ],
        };
      },
    };

    const res = await listAuditEvents(
      {
        institutionId: 'my-institution-uuid',
        search: 'Alice',
        category: 'auth',
        role: 'admin',
        page: 2,
        limit: 10,
      },
      mockDb,
    );

    assert.equal(res.total, 42);
    assert.equal(res.page, 2);
    assert.equal(res.limit, 10);
    assert.equal(res.rows.length, 1);
    assert.equal(res.rows[0].actor.name, 'Test Admin');
    assert.equal(res.rows[0].category, 'auth');

    // Check SQL queries generated
    assert.ok(executedQueries.length >= 2);
    const [countQ, dataQ] = executedQueries;

    // Scoping requirement: institution_id MUST be enforced in both queries
    assert.ok(countQ.sql.includes('al.institution_id = $1'));
    assert.ok(dataQ.sql.includes('al.institution_id = $1'));

    // Category filter check
    assert.ok(countQ.sql.includes('al.action = ANY('));

    // Role filter check
    assert.ok(countQ.sql.includes('u.role ='));

    // Pagination check (offset should be 10 for page 2 with limit 10)
    assert.equal(dataQ.params[dataQ.params.length - 2], 10); // limit
    assert.equal(dataQ.params[dataQ.params.length - 1], 10); // offset
  });

  it('bounds invalid pagination values safely', async () => {
    let capturedParams = null;
    const mockDb = {
      query: async (sql, params) => {
        if (!sql.includes('COUNT(*)')) {
          capturedParams = params;
          return { rows: [] };
        }
        return { rows: [{ total: '0' }] };
      },
    };

    await listAuditEvents(
      {
        institutionId: 'inst-1',
        page: -5,
        limit: 9999, // exceeds max limit of 100
      },
      mockDb,
    );

    assert.ok(capturedParams);
    const limitParam = capturedParams[capturedParams.length - 2];
    const offsetParam = capturedParams[capturedParams.length - 1];
    assert.equal(limitParam, 100); // capped at 100
    assert.equal(offsetParam, 0);  // page bounded to 1 (offset 0)
  });

  it('applies system role filter when role is system', async () => {
    let capturedSql = '';
    const mockDb = {
      query: async (sql) => {
        capturedSql += sql;
        if (sql.includes('COUNT(*)')) return { rows: [{ total: '0' }] };
        return { rows: [] };
      },
    };

    await listAuditEvents(
      {
        institutionId: 'inst-1',
        role: 'system',
      },
      mockDb,
    );

    assert.ok(capturedSql.includes('al.actor_id IS NULL'));
  });
});

