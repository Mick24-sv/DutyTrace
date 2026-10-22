import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { STATUS, buildSessions, localDateKey, summarizeMonth } from '../src/modules/attendance/calc.js';

// Pure unit tests: no database. Asia/Manila is UTC+8 all year (no DST).
const TZ = 'Asia/Manila';
const MAX = 12 * 3600;
let n = 0;
const ev = (type, iso) => ({ id: `e${++n}`, eventType: type, recordedAt: new Date(iso) });
const build = (events, now = '2026-09-30T00:00:00Z') =>
  buildSessions(events, { now: new Date(now), timeZone: TZ, maxSessionSeconds: MAX });

describe('session pairing and hours', () => {
  test('a complete 08:00-12:30 session is exactly 4.5 hours', () => {
    const [s] = build([ev('time_in', '2026-09-01T08:00:00+08:00'), ev('time_out', '2026-09-01T12:30:00+08:00')]);
    assert.equal(s.status, STATUS.COMPLETE);
    assert.equal(s.seconds, 16200);
    assert.equal(s.counted, true);
    assert.equal(summarizeMonth([s], '2026-09').totals.recordedHours, 4.5);
  });

  test('hours are summed from seconds and rounded once (no rounding drift)', () => {
    // Three sessions of 1000 s. Rounding each to 0.28 h first would give 0.84; the true total is 0.83.
    const events = [];
    for (const day of ['01', '02', '03']) {
      events.push(ev('time_in', `2026-09-${day}T08:00:00+08:00`), ev('time_out', `2026-09-${day}T08:16:40+08:00`));
    }
    const { totals } = summarizeMonth(build(events), '2026-09');
    assert.equal(totals.recordedSeconds, 3000);
    assert.equal(totals.recordedHours, 0.83);
  });

  test('two time-ins in a row: the first is missing its time-out and is not counted', () => {
    const sessions = build([
      ev('time_in', '2026-09-03T08:00:00+08:00'),
      ev('time_in', '2026-09-04T08:00:00+08:00'),
      ev('time_out', '2026-09-04T10:00:00+08:00'),
    ]);
    assert.deepEqual(sessions.map((s) => s.status), [STATUS.MISSING_TIME_OUT, STATUS.COMPLETE]);
    assert.equal(sessions[0].seconds, null);
    assert.equal(sessions[0].counted, false);
    assert.equal(summarizeMonth(sessions, '2026-09').totals.recordedHours, 2);
  });

  test('a time-out with no time-in is an orphan and is not counted', () => {
    const [s] = build([ev('time_out', '2026-09-05T17:00:00+08:00')]);
    assert.equal(s.status, STATUS.ORPHAN_TIME_OUT);
    assert.equal(s.timeIn, null);
    assert.equal(s.counted, false);
  });

  test('an open time-in is in_progress within the limit, missing_time_out after it; neither counts', () => {
    const events = [ev('time_in', '2026-09-10T08:00:00+08:00')];
    const soon = build(events, '2026-09-10T01:00:00Z'); // 1 h later
    const late = build(events, '2026-09-11T00:00:00Z'); // 16 h later
    assert.equal(soon[0].status, STATUS.IN_PROGRESS);
    assert.equal(late[0].status, STATUS.MISSING_TIME_OUT);
    assert.equal(soon[0].counted || late[0].counted, false);
    assert.equal(summarizeMonth(soon, '2026-09').totals.inProgress, true);
  });

  test('sessions over the length limit need review and are not counted; exactly the limit is counted', () => {
    const over = build([ev('time_in', '2026-09-06T08:00:00+08:00'), ev('time_out', '2026-09-06T21:00:00+08:00')]); // 13 h
    const exact = build([ev('time_in', '2026-09-07T08:00:00+08:00'), ev('time_out', '2026-09-07T20:00:00+08:00')]); // 12 h
    assert.equal(over[0].status, STATUS.NEEDS_REVIEW);
    assert.equal(over[0].counted, false);
    assert.equal(over[0].seconds, 13 * 3600, 'raw duration is still shown');
    assert.equal(exact[0].status, STATUS.COMPLETE);
    assert.equal(exact[0].counted, true);
  });

  test('a session crossing midnight belongs to the day of its time-in and is flagged', () => {
    const [s] = build([ev('time_in', '2026-09-30T22:00:00+08:00'), ev('time_out', '2026-10-01T02:00:00+08:00')]);
    assert.equal(s.date, '2026-09-30');
    assert.deepEqual(s.flags, ['crosses_midnight']);
    assert.equal(s.seconds, 4 * 3600);
  });
});

describe('local time and months', () => {
  test('days are bucketed in the configured timezone, not UTC', () => {
    // 16:30Z on Oct 31 is 00:30 on Nov 1 in Manila.
    assert.equal(localDateKey(new Date('2026-10-31T16:30:00Z'), TZ), '2026-11-01');
    assert.equal(localDateKey(new Date('2026-10-31T16:30:00Z'), 'UTC'), '2026-10-31');
  });

  test('a session that starts just after local midnight on Nov 1 counts for November, not October', () => {
    const sessions = build([ev('time_in', '2026-10-31T16:30:00Z'), ev('time_out', '2026-10-31T17:30:00Z')]);
    assert.equal(summarizeMonth(sessions, '2026-11').totals.recordedHours, 1);
    assert.equal(summarizeMonth(sessions, '2026-10').totals.recordedHours, 0);
  });

  test('monthly summary groups by day, counts incomplete sessions, and keeps verified hours separate', () => {
    const sessions = build([
      ev('time_in', '2026-09-01T08:00:00+08:00'), ev('time_out', '2026-09-01T12:00:00+08:00'),
      ev('time_in', '2026-09-01T13:00:00+08:00'), ev('time_out', '2026-09-01T17:00:00+08:00'),
      ev('time_out', '2026-09-05T17:00:00+08:00'),
      ev('time_in', '2026-10-02T08:00:00+08:00'), ev('time_out', '2026-10-02T09:00:00+08:00'),
    ]);
    const sep = summarizeMonth(sessions, '2026-09');
    assert.deepEqual(sep.days.map((d) => [d.date, d.recordedHours]), [['2026-09-01', 8], ['2026-09-05', 0]]);
    assert.equal(sep.totals.recordedHours, 8);
    assert.equal(sep.totals.incompleteCount, 1);
    assert.equal(sep.totals.countedSessions, 2);
    assert.equal(sep.totals.verifiedHours, 0);
    assert.equal(sep.totals.verificationAvailable, false);
    assert.equal(summarizeMonth(sessions, '2026-10').totals.recordedHours, 1);
  });

  test('no events gives an empty, zero summary', () => {
    const { days, totals } = summarizeMonth(build([]), '2026-09');
    assert.deepEqual(days, []);
    assert.equal(totals.recordedSeconds, 0);
    assert.equal(totals.incompleteCount, 0);
  });
});
