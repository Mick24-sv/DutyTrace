import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { generateCsv } from '../src/modules/reports/csv.js';
import { canView } from '../src/modules/common/access.js';
import { calculateSemesterProgress, currentTermForDate, verifiedSecondsForTerm } from '../src/modules/semesters/semester.rules.js';
import {
  enforceOfficeScope,
  paginateArray,
  resolveMonthRange,
} from '../src/modules/reports/reports.service.js';

describe('CSV Generation Utility', () => {
  test('generates valid CSV with header and rows', () => {
    const columns = [
      { header: 'Student Name', key: 'name' },
      { header: 'Recorded Hours', key: 'hours' },
      { header: 'Status', key: 'status' },
    ];
    const rows = [
      { name: 'Juan Dela Cruz', hours: 40.5, status: 'complete' },
      { name: 'Maria Santos', hours: 38.0, status: 'in_progress' },
    ];
    const csv = generateCsv(columns, rows);
    const lines = csv.split('\r\n');
    assert.equal(lines.length, 3);
    assert.equal(lines[0], 'Student Name,Recorded Hours,Status');
    assert.equal(lines[1], 'Juan Dela Cruz,40.5,complete');
    assert.equal(lines[2], 'Maria Santos,38,in_progress');
  });

  test('escapes commas, quotes, and newlines in cell values', () => {
    const columns = [
      { header: 'Reason', key: 'reason' },
      { header: 'Note', key: 'note' },
    ];
    const rows = [
      { reason: 'Sick, with fever', note: 'Doctor says "rest"' },
      { reason: 'Family emergency\nOut of town', note: 'Standard note' },
    ];
    const csv = generateCsv(columns, rows);
    const lines = csv.split('\r\n');
    assert.equal(lines[0], 'Reason,Note');
    assert.equal(lines[1], '"Sick, with fever","Doctor says ""rest"""');
    assert.ok(csv.includes('"Family emergency\nOut of town"'));
  });

  test('handles empty dataset gracefully', () => {
    const columns = [
      { header: 'Col A', key: 'a' },
      { header: 'Col B', key: 'b' },
    ];
    const csv = generateCsv(columns, []);
    assert.equal(csv, 'Col A,Col B');
  });

  test('handles custom formatters and null values', () => {
    const columns = [
      { header: 'Active', format: (r) => (r.active ? 'Yes' : 'No') },
      { header: 'Remarks', key: 'remarks' },
    ];
    const rows = [
      { active: true, remarks: null },
      { active: false, remarks: undefined },
    ];
    const csv = generateCsv(columns, rows);
    const lines = csv.split('\r\n');
    assert.equal(lines[1], 'Yes,');
    assert.equal(lines[2], 'No,');
  });
});

describe('Report Pagination and Boundaries', () => {
  const dataset = Array.from({ length: 45 }, (_, i) => ({ id: i + 1, name: `Student ${i + 1}` }));

  test('paginates correctly on first page', () => {
    const res = paginateArray(dataset, 1, 10);
    assert.equal(res.items.length, 10);
    assert.equal(res.items[0].id, 1);
    assert.equal(res.items[9].id, 10);
    assert.equal(res.pagination.page, 1);
    assert.equal(res.pagination.limit, 10);
    assert.equal(res.pagination.total, 45);
    assert.equal(res.pagination.totalPages, 5);
  });

  test('paginates correctly on last page with partial count', () => {
    const res = paginateArray(dataset, 5, 10);
    assert.equal(res.items.length, 5);
    assert.equal(res.items[0].id, 41);
    assert.equal(res.items[4].id, 45);
    assert.equal(res.pagination.page, 5);
  });

  test('handles out-of-bounds page gracefully', () => {
    const res = paginateArray(dataset, 999, 10);
    assert.equal(res.items.length, 0);
    assert.equal(res.pagination.page, 999);
    assert.equal(res.pagination.totalPages, 5);
  });

  test('handles empty dataset pagination', () => {
    const res = paginateArray([], 1, 20);
    assert.equal(res.items.length, 0);
    assert.equal(res.pagination.total, 0);
    assert.equal(res.pagination.totalPages, 1);
  });
});

describe('Report Role-Based Access Scoping', () => {
  const supervisorOfficeId = '11111111-1111-4000-8000-111111111111';
  const otherOfficeId = '22222222-2222-4000-8000-222222222222';

  const supervisorUser = {
    id: 'user-sup',
    role: 'supervisor',
    office: { id: supervisorOfficeId, name: 'Main Library' },
  };

  const supervisorWithoutOffice = {
    id: 'user-sup-no-office',
    role: 'supervisor',
    office: null,
  };

  const adminUser = {
    id: 'user-admin',
    role: 'admin',
    office: null,
  };

  test('supervisor is scoped to their assigned office', () => {
    const officeId = enforceOfficeScope(supervisorUser, null);
    assert.equal(officeId, supervisorOfficeId);
  });

  test('supervisor cannot request another office and gets 403 Forbidden', () => {
    assert.throws(
      () => enforceOfficeScope(supervisorUser, otherOfficeId),
      (err) => err.status === 403 && err.code === 'FORBIDDEN',
    );
  });

  test('supervisor without office gets 403 Forbidden', () => {
    assert.throws(
      () => enforceOfficeScope(supervisorWithoutOffice, null),
      (err) => err.status === 403 && err.code === 'FORBIDDEN',
    );
  });

  test('admin can request specific office', () => {
    const officeId = enforceOfficeScope(adminUser, otherOfficeId);
    assert.equal(officeId, otherOfficeId);
  });

  test('admin can request all offices (null officeId)', () => {
    const officeId = enforceOfficeScope(adminUser, null);
    assert.equal(officeId, null);
  });

  test('administrator record access is limited to their institution', () => {
    const scopedAdmin = { ...adminUser, institutionId: 'institution-a' };
    assert.equal(canView(scopedAdmin, { institution_id: 'institution-a' }), true);
    assert.equal(canView(scopedAdmin, { institution_id: 'institution-b' }), false);
    assert.equal(canView({ ...adminUser, institutionId: undefined }, { institution_id: 'institution-a' }), false);
  });
});

describe('Recorded vs. Verified Hours and Outstanding Deficit Rules', () => {
  test('verified hours never exceed approved DTR hours', () => {
    const recordedHours = 45.0;
    const approvedDtrVerifiedHours = 40.0;
    const requiredHours = 40.0;

    // Remaining required hours calculation
    const remainingHours = Math.max(0, requiredHours - recordedHours);
    assert.equal(remainingHours, 0, 'Met requirement');

    // Unverified variance
    const variance = recordedHours - approvedDtrVerifiedHours;
    assert.equal(variance, 5.0, '5 hours remain unverified until next approval');
  });

  describe('semester duty-hour calculations', () => {
    test('calculates per-student targets independently and caps completion at 100%', () => {
      assert.deepEqual(calculateSemesterProgress({ requiredHours: 120, verifiedHours: 60 }), {
        requiredHours: 120, verifiedHours: 60, remainingHours: 60, completionPercentage: 50, requirementAssigned: true,
      });
      assert.deepEqual(calculateSemesterProgress({ requiredHours: 240, verifiedHours: 300 }), {
        requiredHours: 240, verifiedHours: 300, remainingHours: 0, completionPercentage: 100, requirementAssigned: true,
      });
    });

    test('does not invent a target or progress for an unassigned student', () => {
      assert.deepEqual(calculateSemesterProgress({ requiredHours: null, verifiedHours: 8 }), {
        requiredHours: null, verifiedHours: 8, remainingHours: null, completionPercentage: null, requirementAssigned: false,
      });
    });

    test('includes approved counted sessions only, within local term date boundaries', () => {
      const snapshot = (timeIn, counted = true) => ({
        days: [{ sessions: [{ timeIn, seconds: 3600, counted }] }],
      });
      const rows = [
        { status: 'approved', snapshot: snapshot('2026-08-31T17:00:00.000Z') },
        { status: 'approved', snapshot: snapshot('2026-12-31T16:00:00.000Z') },
        { status: 'approved', snapshot: snapshot('2026-09-01T00:00:00.000Z', false) },
        { status: 'submitted', snapshot: snapshot('2026-10-01T00:00:00.000Z') },
        { status: 'approved', snapshot: snapshot('2026-08-31T15:59:59.000Z') },
      ];
      assert.equal(verifiedSecondsForTerm(rows, '2026-09-01', '2027-01-01', 'Asia/Manila'), 7200);
    });

    test('selects first, second, and summer terms by timezone-aware inclusive boundaries', () => {
      const terms = [
        { semester: 'first', startsOn: '2026-06-01', endsOn: '2026-10-31' },
        { semester: 'second', startsOn: '2026-11-01', endsOn: '2027-03-31' },
        { semester: 'summer', startsOn: '2027-04-01', endsOn: '2027-05-31' },
      ];
      assert.equal(currentTermForDate(terms, new Date('2026-10-31T15:59:59Z'), 'Asia/Manila').semester, 'first');
      assert.equal(currentTermForDate(terms, new Date('2026-10-31T16:00:01Z'), 'Asia/Manila').semester, 'second');
      assert.equal(currentTermForDate(terms, new Date('2027-04-01T00:00:00Z'), 'UTC').semester, 'summer');
      assert.equal(currentTermForDate(terms, new Date('2027-06-01T00:00:00Z'), 'UTC'), null);
    });
  });

  test('deficit calculation when recorded hours are below requirement', () => {
    const recordedHours = 28.5;
    const requiredHours = 40.0;

    const remainingHours = Math.max(0, Math.round((requiredHours - recordedHours) * 100) / 100);
    assert.equal(remainingHours, 11.5);
    const meetsRequirement = recordedHours >= requiredHours;
    assert.equal(meetsRequirement, false);
  });

  test('zero recorded hours gives full deficit', () => {
    const recordedHours = 0;
    const requiredHours = 40.0;

    const remainingHours = Math.max(0, requiredHours - recordedHours);
    assert.equal(remainingHours, 40.0);
  });
});
