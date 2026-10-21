import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  scheduleDayHours,
  calculateHistoricalAttendancePace,
  calculateConfirmedScheduleHours,
  calculateDutyForecast,
} from '../src/modules/forecast/forecast.calc.js';
import {
  getStudentForecast,
  getOfficeForecasts,
  getInstitutionForecasts,
} from '../src/modules/forecast/forecast.service.js';

describe('Duty Completion Forecast Calculations (Unit Tests)', () => {
  describe('scheduleDayHours', () => {
    it('computes morning shift duration accurately', () => {
      const day = { weekday: 1, startsAt: '08:00', endsAt: '12:00' };
      assert.equal(scheduleDayHours(day), 4.0);
    });

    it('computes morning plus afternoon shift duration', () => {
      const day = {
        weekday: 2,
        startsAt: '08:00',
        endsAt: '11:30',
        afternoonStartsAt: '13:00',
        afternoonEndsAt: '16:30',
      };
      assert.equal(scheduleDayHours(day), 7.0);
    });

    it('returns 0 for empty or invalid day time slots', () => {
      assert.equal(scheduleDayHours({ weekday: 3 }), 0);
      assert.equal(scheduleDayHours({ weekday: 4, startsAt: '12:00', endsAt: '10:00' }), 0);
    });
  });

  describe('calculateHistoricalAttendancePace', () => {
    const timeZone = 'Asia/Manila';
    const maxSessionSeconds = 12 * 3600;

    it('returns zero pace and hasAttendance: false for students with no attendance', () => {
      const result = calculateHistoricalAttendancePace({
        events: [],
        windowStartDate: '2026-09-01',
        today: '2026-09-28',
        timeZone,
        maxSessionSeconds,
        configuredWindowWeeks: 4,
      });

      assert.equal(result.hasAttendance, false);
      assert.equal(result.actualWeeklyPace, 0);
      assert.equal(result.historicalHours, 0);
      assert.equal(result.sessionCount, 0);
    });

    it('excludes invalid, uncompleted, or orphaned attendance sessions', () => {
      // 1 valid session (4 hours) + 1 orphan time_out + 1 unclosed time_in older than max limit
      const events = [
        // Valid 4-hour session
        { id: '1', eventType: 'time_in', recordedAt: new Date('2026-09-10T00:00:00.000Z') },
        { id: '2', eventType: 'time_out', recordedAt: new Date('2026-09-10T04:00:00.000Z') },
        // Orphan time_out (no time_in) - invalid
        { id: '3', eventType: 'time_out', recordedAt: new Date('2026-09-12T05:00:00.000Z') },
      ];

      const result = calculateHistoricalAttendancePace({
        events,
        windowStartDate: '2026-09-01',
        today: '2026-09-28',
        timeZone: 'UTC',
        maxSessionSeconds,
        configuredWindowWeeks: 4,
      });

      assert.equal(result.hasAttendance, true);
      assert.equal(result.historicalHours, 4.0);
      assert.equal(result.sessionCount, 1);
    });

    it('excludes sessions outside the historical evaluation window', () => {
      const events = [
        // Session BEFORE window
        { id: '1', eventType: 'time_in', recordedAt: new Date('2026-08-15T00:00:00.000Z') },
        { id: '2', eventType: 'time_out', recordedAt: new Date('2026-08-15T04:00:00.000Z') },
        // Session INSIDE window (6 hours)
        { id: '3', eventType: 'time_in', recordedAt: new Date('2026-09-15T00:00:00.000Z') },
        { id: '4', eventType: 'time_out', recordedAt: new Date('2026-09-15T06:00:00.000Z') },
      ];

      const result = calculateHistoricalAttendancePace({
        events,
        windowStartDate: '2026-09-01',
        today: '2026-09-28',
        timeZone: 'UTC',
        maxSessionSeconds,
        configuredWindowWeeks: 4,
      });

      assert.equal(result.historicalHours, 6.0);
      assert.equal(result.sessionCount, 1);
    });

    it('handles weeks with zero attendance without division-by-zero or extreme spikes', () => {
      // 16 hours attended during 1 week of a 4-week period
      const events = [
        { id: '1', eventType: 'time_in', recordedAt: new Date('2026-09-07T00:00:00.000Z') },
        { id: '2', eventType: 'time_out', recordedAt: new Date('2026-09-07T08:00:00.000Z') },
        { id: '3', eventType: 'time_in', recordedAt: new Date('2026-09-08T00:00:00.000Z') },
        { id: '4', eventType: 'time_out', recordedAt: new Date('2026-09-08T08:00:00.000Z') },
      ];

      const result = calculateHistoricalAttendancePace({
        events,
        windowStartDate: '2026-09-01',
        today: '2026-09-28',
        timeZone: 'UTC',
        maxSessionSeconds,
        configuredWindowWeeks: 4,
      });

      assert.equal(result.hasAttendance, true);
      assert.equal(result.historicalHours, 16.0);
      assert.equal(result.activeWeeksCount, 1);
      // Pace is averaged over the 4 elapsed window weeks (16 / 4 = 4.0 h/week), not 16.0
      assert.equal(result.actualWeeklyPace, 4.0);
    });
  });

  describe('calculateConfirmedScheduleHours', () => {
    it('returns zero when no approved schedule is provided', () => {
      const res = calculateConfirmedScheduleHours({
        approvedSchedule: null,
        today: '2026-10-01',
        deadline: '2026-12-01',
      });
      assert.equal(res.hasConfirmedSchedule, false);
      assert.equal(res.confirmedWeeklyHours, 0);
      assert.equal(res.confirmedFutureHours, 0);
    });

    it('calculates weekly confirmed hours and future shift hours up to deadline', () => {
      const approvedSchedule = {
        effectiveStartsOn: '2026-10-01',
        effectiveEndsOn: '2026-12-31',
        days: [
          // Mon: 4h
          { weekday: 1, startsAt: '08:00', endsAt: '12:00' },
          // Wed: 4h
          { weekday: 3, startsAt: '08:00', endsAt: '12:00' },
        ],
      };

      const res = calculateConfirmedScheduleHours({
        approvedSchedule,
        today: '2026-10-01', // Thursday
        deadline: '2026-10-15', // Thursday (2 weeks later: exactly 2 Mon + 2 Wed = 4 shifts * 4h = 16h)
      });

      assert.equal(res.hasConfirmedSchedule, true);
      assert.equal(res.confirmedWeeklyHours, 8.0);
      assert.equal(res.confirmedFutureHours, 16.0);
    });
  });

  describe('calculateDutyForecast', () => {
    const basePace = {
      actualWeeklyPace: 8.0,
      historicalHours: 32.0,
      hasAttendance: true,
      windowWeeks: 4,
    };
    const baseSchedule = {
      hasConfirmedSchedule: true,
      confirmedWeeklyHours: 10.0,
      confirmedFutureHours: 60.0,
    };

    it('marks requirement as completed when remainingHours is 0', () => {
      const forecast = calculateDutyForecast({
        requiredHours: 100,
        validatedCompletedHours: 100,
        recordedHours: 105,
        deadline: '2026-12-15',
        today: '2026-10-21',
        historicalPace: basePace,
        confirmedSchedule: baseSchedule,
      });

      assert.equal(forecast.status, 'completed');
      assert.equal(forecast.isCompleted, true);
      assert.equal(forecast.remainingHours, 0);
      assert.equal(forecast.projectedCompletionDate, null);
      assert.equal(forecast.estimatedWeeksRemaining, 0);
      assert.match(forecast.reason, /met/i);
    });

    it('marks requirement as completed when validated hours exceed required', () => {
      const forecast = calculateDutyForecast({
        requiredHours: 80,
        validatedCompletedHours: 85,
        recordedHours: 85,
        deadline: '2026-12-15',
        today: '2026-10-21',
        historicalPace: basePace,
        confirmedSchedule: baseSchedule,
      });

      assert.equal(forecast.status, 'completed');
      assert.equal(forecast.remainingHours, 0);
      assert.equal(forecast.projectedCompletionDate, null);
    });

    it('returns insufficient_data when requiredHours is not assigned', () => {
      const forecast = calculateDutyForecast({
        requiredHours: null,
        validatedCompletedHours: 20,
        deadline: '2026-12-15',
        today: '2026-10-21',
        historicalPace: basePace,
        confirmedSchedule: baseSchedule,
      });

      assert.equal(forecast.status, 'insufficient_data');
      assert.match(forecast.reason, /no duty-hour requirement assigned/i);
      assert.equal(forecast.projectedCompletionDate, null);
    });

    it('returns insufficient_data when deadline is missing', () => {
      const forecast = calculateDutyForecast({
        requiredHours: 100,
        validatedCompletedHours: 20,
        deadline: null,
        today: '2026-10-21',
        historicalPace: basePace,
        confirmedSchedule: baseSchedule,
      });

      assert.equal(forecast.status, 'insufficient_data');
      assert.match(forecast.reason, /no completion deadline/i);
    });

    it('returns insufficient_data when student has no attendance history', () => {
      const forecast = calculateDutyForecast({
        requiredHours: 100,
        validatedCompletedHours: 0,
        deadline: '2026-12-15',
        today: '2026-10-21',
        historicalPace: { actualWeeklyPace: 0, hasAttendance: false, windowWeeks: 4 },
        confirmedSchedule: baseSchedule,
      });

      assert.equal(forecast.status, 'insufficient_data');
      assert.match(forecast.reason, /no attendance recorded/i);
      assert.equal(forecast.projectedCompletionDate, null);
    });

    it('identifies on_track when completion date is on or before deadline', () => {
      // 32 hours remaining at 8h/week = 4 weeks (28 days). Today 2026-10-21 -> completion ~2026-11-18 <= 2026-12-15
      const forecast = calculateDutyForecast({
        requiredHours: 80,
        validatedCompletedHours: 48,
        deadline: '2026-12-15',
        today: '2026-10-21',
        historicalPace: { actualWeeklyPace: 8.0, hasAttendance: true, windowWeeks: 4 },
        confirmedSchedule: baseSchedule,
      });

      assert.equal(forecast.status, 'on_track');
      assert.equal(forecast.remainingHours, 32);
      assert.ok(forecast.projectedCompletionDate <= '2026-12-15');
      assert.match(forecast.reason, /on or before the deadline/i);
    });

    it('identifies at_risk when projected completion is after deadline', () => {
      // 80 hours remaining at 2h/week = 40 weeks -> completion far after 2026-12-15
      const forecast = calculateDutyForecast({
        requiredHours: 100,
        validatedCompletedHours: 20,
        deadline: '2026-12-15',
        today: '2026-10-21',
        historicalPace: { actualWeeklyPace: 2.0, hasAttendance: true, windowWeeks: 4 },
        confirmedSchedule: baseSchedule,
      });

      assert.equal(forecast.status, 'at_risk');
      assert.ok(forecast.projectedCompletionDate > '2026-12-15');
      assert.match(forecast.reason, /after the deadline/i);
    });

    it('identifies at_risk when deadline has already passed with hours remaining', () => {
      const forecast = calculateDutyForecast({
        requiredHours: 100,
        validatedCompletedHours: 50,
        deadline: '2026-10-01',
        today: '2026-10-21',
        historicalPace: basePace,
        confirmedSchedule: baseSchedule,
      });

      assert.equal(forecast.status, 'at_risk');
      assert.match(forecast.reason, /deadline.*passed/i);
    });
  });
});

describe('Duty Completion Forecast Service & Authorization Tests', () => {
  const institutionA = '11111111-1111-1111-1111-111111111111';
  const institutionB = '22222222-2222-2222-2222-222222222222';
  const officeA = '33333333-3333-3333-3333-333333333333';
  const officeB = '44444444-4444-4444-4444-444444444444';
  const studentA = '55555555-5555-5555-5555-555555555555';
  const studentB = '66666666-6666-6666-6666-666666666666';

  const mockDb = {
    query: async (sql, params) => {
      // Mock student query
      if (sql.includes('FROM users u') && sql.includes('WHERE u.id = $1')) {
        const id = params[0];
        if (id === studentA) {
          return {
            rows: [
              {
                id: studentA,
                full_name: 'Student A',
                email: 'student_a@school.edu',
                institution_id: institutionA,
                office_id: officeA,
                office_name: 'Office A',
              },
            ],
          };
        }
        if (id === studentB) {
          return {
            rows: [
              {
                id: studentB,
                full_name: 'Student B',
                email: 'student_b@school.edu',
                institution_id: institutionB,
                office_id: officeB,
                office_name: 'Office B',
              },
            ],
          };
        }
        return { rows: [] };
      }

      // Mock academic term query
      if (sql.includes('FROM academic_terms t')) {
        return {
          rows: [
            {
              id: 'term-uuid',
              institution_id: institutionA,
              academic_year: '2026-2027',
              semester: 'first',
              starts_on: '2026-08-01',
              ends_on: '2026-12-20',
              completion_deadline: '2026-12-15',
              timezone: 'Asia/Manila',
            },
          ],
        };
      }

      // Mock now
      if (sql.includes('SELECT now() AS now')) {
        return { rows: [{ now: new Date('2026-10-21T08:00:00.000Z') }] };
      }

      // Mock settings
      if (sql.includes('FROM institution_duty_requirement_settings')) {
        return { rows: [{ forecast_historical_weeks: 4 }] };
      }

      // Mock requirement
      if (sql.includes('FROM semester_requirement_assignments')) {
        return {
          rows: [
            {
              student_id: studentA,
              office_id: officeA,
              office_name: 'Office A',
              required_hours: '100.00',
            },
          ],
        };
      }

      // Default mock query results
      return { rows: [] };
    },
  };

  it('prevents a Student Assistant from accessing another student forecast', async () => {
    const studentUser = {
      id: studentA,
      role: 'student',
      institutionId: institutionA,
    };

    await assert.rejects(
      async () => {
        await getStudentForecast(studentB, { actor: studentUser, db: mockDb });
      },
      (err) => err.status === 403 && /only view your own/i.test(err.message),
    );
  });

  it('prevents cross-institution access', async () => {
    const adminUser = {
      id: 'admin-uuid',
      role: 'admin',
      institutionId: institutionA,
    };

    // Attempting to access student from institution B
    await assert.rejects(
      async () => {
        await getStudentForecast(studentB, { actor: adminUser, db: mockDb });
      },
      (err) => err.status === 403 && /outside your institution/i.test(err.message),
    );
  });

  it('prevents a Supervisor from accessing students outside their assigned office', async () => {
    const supervisorUser = {
      id: 'supervisor-uuid',
      role: 'supervisor',
      institutionId: institutionA,
      office: { id: officeB }, // different office
    };

    await assert.rejects(
      async () => {
        await getStudentForecast(studentA, { actor: supervisorUser, db: mockDb });
      },
      (err) => err.status === 403 && /assigned to your office/i.test(err.message),
    );
  });

  it('prevents a Supervisor from requesting another office forecasts', async () => {
    const supervisorUser = {
      id: 'supervisor-uuid',
      role: 'supervisor',
      institutionId: institutionA,
      office: { id: officeA },
    };

    await assert.rejects(
      async () => {
        await getOfficeForecasts(officeB, { actor: supervisorUser, db: mockDb });
      },
      (err) => err.status === 403 && /your own office/i.test(err.message),
    );
  });

  it('prevents non-administrators from accessing institution-wide forecasts', async () => {
    const supervisorUser = {
      id: 'supervisor-uuid',
      role: 'supervisor',
      institutionId: institutionA,
      office: { id: officeA },
    };

    await assert.rejects(
      async () => {
        await getInstitutionForecasts({ actor: supervisorUser, db: mockDb });
      },
      (err) => err.status === 403 && /only administrators/i.test(err.message),
    );
  });

  it('allows a Student Assistant to view their own forecast', async () => {
    const studentUser = {
      id: studentA,
      role: 'student',
      institutionId: institutionA,
    };

    const forecast = await getStudentForecast(studentA, { actor: studentUser, db: mockDb });
    assert.ok(forecast);
    assert.equal(forecast.student.id, studentA);
    assert.equal(forecast.requiredHours, 100);
  });
});

