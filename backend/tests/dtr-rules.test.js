import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DTR_STATUS, TRANSITIONS, buildSnapshot, canTransition, endedMonths, isMonthEnded, localMonthOf } from '../src/modules/dtr/dtr.rules.js';
import { pdfSafe, renderDtrPdf } from '../src/modules/dtr/dtr.pdf.js';

const MNL = 'Asia/Manila'; // UTC+8, no DST

describe('month-end eligibility (local timezone)', () => {
  it('a month is not ended while it is still the current local month', () => {
    assert.equal(isMonthEnded('2026-09', new Date('2026-09-15T00:00:00Z'), MNL), false);
    assert.equal(isMonthEnded('2026-09', new Date('2026-09-30T15:59:59Z'), MNL), false); // 23:59:59 on Sep 30 in Manila
  });
  it('ends exactly at local midnight, not UTC midnight', () => {
    // 16:00:00Z on Sep 30 is 00:00:00 on Oct 1 in Manila
    assert.equal(isMonthEnded('2026-09', new Date('2026-09-30T16:00:00Z'), MNL), true);
    // ...while in UTC the month is still September
    assert.equal(isMonthEnded('2026-09', new Date('2026-09-30T16:00:00Z'), 'UTC'), false);
  });
  it('future months and the current month are never eligible', () => {
    const now = new Date('2026-10-17T04:00:00Z');
    assert.equal(isMonthEnded('2026-10', now, MNL), false);
    assert.equal(isMonthEnded('2026-11', now, MNL), false);
    assert.equal(isMonthEnded('2027-01', now, MNL), false);
    assert.equal(isMonthEnded('2026-09', now, MNL), true);
    assert.equal(isMonthEnded('2025-12', now, MNL), true);
  });
  it('handles the year boundary', () => {
    assert.equal(localMonthOf(new Date('2026-12-31T16:30:00Z'), MNL), '2027-01');
    assert.equal(isMonthEnded('2026-12', new Date('2026-12-31T16:30:00Z'), MNL), true);
  });
  it('lists ended months newest first across a year boundary', () => {
    assert.deepEqual(endedMonths(new Date('2026-02-10T00:00:00Z'), MNL, 3), ['2026-01', '2025-12', '2025-11']);
  });
});

describe('status transitions', () => {
  const S = DTR_STATUS;
  it('allows exactly the documented moves', () => {
    assert.ok(canTransition(S.DRAFT, S.SUBMITTED));
    assert.ok(canTransition(S.SUBMITTED, S.UNDER_REVIEW));
    assert.ok(canTransition(S.UNDER_REVIEW, S.APPROVED));
    assert.ok(canTransition(S.UNDER_REVIEW, S.NEEDS_CORRECTION));
    assert.ok(canTransition(S.NEEDS_CORRECTION, S.DRAFT));
    assert.ok(canTransition(S.NEEDS_CORRECTION, S.SUBMITTED));
  });
  it('rejects shortcuts and anything out of approved', () => {
    assert.equal(canTransition(S.DRAFT, S.APPROVED), false);
    assert.equal(canTransition(S.DRAFT, S.UNDER_REVIEW), false);
    assert.equal(canTransition(S.SUBMITTED, S.APPROVED), false);
    assert.equal(canTransition(S.SUBMITTED, S.NEEDS_CORRECTION), false);
    assert.equal(canTransition(S.UNDER_REVIEW, S.DRAFT), false);
    assert.equal(canTransition(S.NEEDS_CORRECTION, S.APPROVED), false);
    for (const to of Object.values(S)) assert.equal(canTransition(S.APPROVED, to), false);
    assert.deepEqual(TRANSITIONS.approved, []);
  });
});

const session = (id, status, counted, seconds) => ({ id, status, counted, seconds, timeIn: null, timeOut: null, date: '2026-09-05', flags: [] });
const history = (sessions, recordedSeconds) => ({
  month: '2026-09', timezone: MNL, maxSessionHours: 12,
  days: [{ date: '2026-09-05', sessions, recordedSeconds, recordedHours: recordedSeconds / 3600 }],
  totals: { recordedSeconds, countedSessions: sessions.filter((s) => s.counted).length, verifiedHours: 0, verificationAvailable: false },
});
const base = { student: { id: 's', fullName: 'S', email: 'e' }, office: { id: 'o', code: 'C', name: 'N' }, generatedAt: new Date('2026-10-01T00:00:00Z') };

describe('buildSnapshot hour calculations', () => {
  it('computes recorded, required and remaining hours; flags uncounted sessions', () => {
    const snap = buildSnapshot({
      ...base, requiredHours: 40,
      history: history([session('a', 'complete', true, 3 * 3600 + 1800), session('b', 'missing_time_out', false, null), session('c', 'needs_review', false, 14 * 3600)], 3.5 * 3600),
    });
    assert.equal(snap.totals.recordedHours, 3.5);
    assert.equal(snap.totals.requiredHours, 40);
    assert.equal(snap.totals.remainingHours, 36.5);
    assert.equal(snap.totals.incompleteCount, 2);
    assert.deepEqual(snap.flags.map((f) => f.status), ['missing_time_out', 'needs_review']);
    assert.equal(snap.template.official, false);
  });
  it('remaining never goes negative and verified hours are not part of a snapshot', () => {
    const snap = buildSnapshot({ ...base, requiredHours: 10, history: history([session('a', 'complete', true, 12 * 3600)], 12 * 3600) });
    assert.equal(snap.totals.remainingHours, 0);
    assert.equal('verifiedHours' in snap.totals, false);
  });
  it('rounds once from whole seconds', () => {
    const snap = buildSnapshot({ ...base, requiredHours: 40, history: history([], 1234) });
    assert.equal(snap.totals.recordedHours, 0.34);
    assert.equal(snap.totals.remainingHours, 39.66);
  });
});

describe('PDF renderer', () => {
  const detail = (n) => {
    const sessions = Array.from({ length: n }, (_, i) => ({
      id: `s${i}`, status: i % 9 === 0 ? 'missing_time_out' : 'complete', counted: i % 9 !== 0,
      timeIn: `2026-09-${String((i % 27) + 1).padStart(2, '0')}T01:00:00Z`, timeOut: i % 9 === 0 ? null : `2026-09-${String((i % 27) + 1).padStart(2, '0')}T04:00:00Z`,
      seconds: i % 9 === 0 ? null : 10800, date: `2026-09-${String((i % 27) + 1).padStart(2, '0')}`, flags: [],
    }));
    const snap = buildSnapshot({ ...base, requiredHours: 40, history: history(sessions, 3 * 3600 * n) });
    snap.days = sessions.map((s) => ({ date: s.date, sessions: [s], recordedSeconds: s.seconds ?? 0, recordedHours: 3 }));
    return {
      id: 'dtr-1', status: 'draft', month: '2026-09', currentRevision: 1, student: snap.student,
      revision: { number: 1, snapshot: snap }, history: [], verifiedHours: null, verifiedRevision: null, decidedAt: null,
    };
  };
  it('produces a PDF', async () => {
    const buf = await renderDtrPdf(detail(5));
    assert.equal(buf.subarray(0, 5).toString(), '%PDF-');
    assert.ok(buf.length > 1500);
  });
  it('paginates long months onto several pages', async () => {
    const pages = (b) => (b.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length;
    assert.equal(pages(await renderDtrPdf(detail(5))), 1);
    assert.ok(pages(await renderDtrPdf(detail(70))) >= 2);
  });
  it('prints ? for characters the PDF font cannot draw, and keeps Latin-1 letters', () => {
    assert.equal(pdfSafe('Ma. Teresa Peña-Dela Cruz, Zoë'), 'Ma. Teresa Peña-Dela Cruz, Zoë');
    assert.equal(pdfSafe('Łukasz 李'), '?ukasz ?');
    assert.equal(pdfSafe(null), '');
  });
});

