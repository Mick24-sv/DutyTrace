import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ABSENCE_TRANSITIONS, canMoveAbsence, validateAbsenceDates } from '../src/modules/absences/absences.rules.js';
import { CASE_TRANSITIONS, canMoveCase, caseReference, missingRequirements, validateCasePeriod } from '../src/modules/cases/cases.rules.js';
import { cleanFileName, validateUpload } from '../src/modules/documents/files.js';
import { isDateKey } from '../src/modules/common/access.js';
import { SAMPLE } from './helpers/testEnv.js';

const TODAY = '2026-10-18';

describe('absence date rules', () => {
  const ok = (type, start, end = start) => validateAbsenceDates({ type, start, end, today: TODAY });
  it('planned: today or later; unexpected: today or earlier', () => {
    assert.deepEqual(ok('planned', '2026-10-18'), {});
    assert.deepEqual(ok('planned', '2026-11-02', '2026-11-04'), {});
    assert.ok(ok('planned', '2026-10-17').startDate);
    assert.deepEqual(ok('unexpected', '2026-10-18'), {});
    assert.deepEqual(ok('unexpected', '2026-10-10', '2026-10-12'), {});
    assert.ok(ok('unexpected', '2026-10-19').startDate);
  });
  it('rejects reversed ranges, over-long spans and far-off dates', () => {
    assert.ok(ok('planned', '2026-10-25', '2026-10-24').endDate);
    assert.deepEqual(ok('planned', '2026-10-20', '2026-11-19'), {}); // 31 days
    assert.ok(ok('planned', '2026-10-20', '2026-11-20').endDate);    // 32 days
    assert.ok(ok('planned', '2030-01-01').startDate);
    assert.ok(ok('unexpected', '2020-01-01').startDate);
  });
  it('isDateKey rejects impossible dates', () => {
    assert.equal(isDateKey('2026-02-28'), true);
    assert.equal(isDateKey('2026-02-31'), false);
    assert.equal(isDateKey('2026-2-3'), false);
    assert.equal(isDateKey('tomorrow'), false);
  });
});

describe('absence status transitions', () => {
  it('allows exactly the documented moves', () => {
    for (const to of ['acknowledged', 'reviewed', 'needs_follow_up']) assert.ok(canMoveAbsence('pending', to));
    assert.ok(canMoveAbsence('acknowledged', 'reviewed'));
    assert.ok(canMoveAbsence('acknowledged', 'needs_follow_up'));
    assert.ok(canMoveAbsence('needs_follow_up', 'pending'));
    assert.ok(canMoveAbsence('needs_follow_up', 'reviewed'));
  });
  it('rejects going backwards and anything out of reviewed', () => {
    assert.equal(canMoveAbsence('acknowledged', 'pending'), false);
    assert.equal(canMoveAbsence('pending', 'pending'), false);
    for (const to of ['pending', 'acknowledged', 'needs_follow_up', 'reviewed']) assert.equal(canMoveAbsence('reviewed', to), false);
    assert.deepEqual(ABSENCE_TRANSITIONS.reviewed, []);
  });
});

describe('case status transitions and requirements', () => {
  it('allows the documented workflow', () => {
    assert.ok(canMoveCase('open', 'documents_pending'));
    assert.ok(canMoveCase('documents_pending', 'under_review'));
    assert.ok(canMoveCase('under_review', 'needs_correction'));
    assert.ok(canMoveCase('needs_correction', 'under_review'));
    assert.ok(canMoveCase('under_review', 'resolved'));
    assert.ok(canMoveCase('resolved', 'closed'));
    assert.ok(canMoveCase('resolved', 'under_review')); // reopen
  });
  it('rejects shortcuts; a closed case is final', () => {
    assert.equal(canMoveCase('open', 'resolved'), false);
    assert.equal(canMoveCase('documents_pending', 'resolved'), false);
    assert.equal(canMoveCase('needs_correction', 'resolved'), false);
    assert.equal(canMoveCase('resolved', 'needs_correction'), false);
    for (const to of Object.keys(CASE_TRANSITIONS)) assert.equal(canMoveCase('closed', to), false);
  });
  it('a requirement is satisfied by a document or a waiver; optional ones never block', () => {
    const reqs = [
      { label: 'Explanation letter', isRequired: true, waived: false, docCount: 0 },
      { label: 'Medical note', isRequired: true, waived: true, docCount: 0 },
      { label: 'Receipt', isRequired: true, waived: false, docCount: 2 },
      { label: 'Optional extra', isRequired: false, waived: false, docCount: 0 },
    ];
    assert.deepEqual(missingRequirements(reqs), ['Explanation letter']);
    assert.deepEqual(missingRequirements([]), []);
  });
  it('builds reference numbers and checks the period', () => {
    assert.equal(caseReference(2026, 42), 'CC-2026-000042');
    assert.deepEqual(validateCasePeriod('2026-09-01', '2026-09-30'), {});
    assert.ok(validateCasePeriod('2026-09-30', '2026-09-01').periodEnd);
  });
});

describe('upload validation', () => {
  const max = 1024 * 1024;
  const code = (fn) => { try { fn(); } catch (e) { return e.code; } return null; };
  it('accepts PDF, PNG and JPEG decided by their first bytes', () => {
    assert.equal(validateUpload(SAMPLE.pdf, 'letter.pdf', max).mime, 'application/pdf');
    assert.equal(validateUpload(SAMPLE.png, 'scan.PNG', max).mime, 'image/png');
    assert.equal(validateUpload(SAMPLE.jpeg, 'photo.jpg', max).mime, 'image/jpeg');
    assert.equal(validateUpload(SAMPLE.jpeg, 'photo.jpeg', max).mime, 'image/jpeg');
  });
  it('rejects executables, HTML and mismatched extensions', () => {
    assert.equal(code(() => validateUpload(SAMPLE.exe, 'letter.pdf', max)), 'BAD_FILE_TYPE');
    assert.equal(code(() => validateUpload(SAMPLE.html, 'letter.pdf', max)), 'BAD_FILE_TYPE');
    assert.equal(code(() => validateUpload(SAMPLE.pdf, 'letter.png', max)), 'BAD_FILE_TYPE');
    assert.equal(code(() => validateUpload(SAMPLE.pdf, 'letter.html', max)), 'BAD_FILE_TYPE');
    assert.equal(code(() => validateUpload(SAMPLE.pdf, 'letter', max)), 'BAD_FILE_TYPE');
    assert.equal(code(() => validateUpload(SAMPLE.pdf, 'letter.pdf.exe', max)), 'BAD_FILE_TYPE');
  });
  it('rejects empty, oversized and nameless uploads', () => {
    assert.equal(code(() => validateUpload(Buffer.alloc(0), 'a.pdf', max)), 'EMPTY_FILE');
    assert.equal(code(() => validateUpload({}, 'a.pdf', max)), 'EMPTY_FILE');
    assert.equal(code(() => validateUpload(Buffer.concat([SAMPLE.pdf, Buffer.alloc(max)]), 'a.pdf', max)), 'FILE_TOO_LARGE');
    assert.equal(code(() => validateUpload(SAMPLE.pdf, '   ', max)), 'BAD_FILE_NAME');
    assert.equal(code(() => validateUpload(SAMPLE.pdf, '///', max)), 'BAD_FILE_NAME');
  });
  it('cleans file names so they can never act as paths', () => {
    assert.equal(cleanFileName('../../etc/passwd.pdf'), 'passwd.pdf');
    assert.equal(cleanFileName('C:\\Users\\me\\letter.pdf'), 'letter.pdf');
    assert.equal(cleanFileName('..hidden.pdf'), 'hidden.pdf');
    assert.equal(cleanFileName('a"b<c>.pdf'), 'abc.pdf');
    assert.equal(cleanFileName('x'.repeat(300) + '.pdf').length <= 120, true);
  });
});
