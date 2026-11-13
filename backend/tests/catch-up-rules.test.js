import {test} from 'node:test';
import assert from 'node:assert/strict';
import {catchUpCapacity,catchUpCandidates} from '../src/modules/duty-requirements/catch-up.rules.js';
import {semesterStatus} from '../src/modules/semesters/semester-status.js';
const days=[{weekday:1,startsAt:'09:00',endsAt:'12:00',afternoonStartsAt:'13:00',afternoonEndsAt:'15:00'}];
const requirement={minimumDailyHours:3,maximumDailyHours:6,permittedWeekdays:[1,2,3,4,5,6],permittedTimeWindows:[{startTime:'08:00',endTime:'12:00'},{startTime:'13:00',endTime:'17:00'}]};
test('catch-up capacity matches standing, ignores non-duty days and respects the deadline',()=>{
  const basis={days,startsOn:'2026-11-13',endsOn:'2026-11-23',today:'2026-11-13'};
  assert.equal(catchUpCapacity(basis),10);
  assert.equal(catchUpCapacity({...basis,endsOn:'2026-11-22'}),5);
  assert.equal(catchUpCapacity({...basis,startsOn:'2026-11-24'}),0);
  const schedule={startsOn:basis.startsOn,endsOn:basis.endsOn,days:days.map(day=>({weekday:day.weekday,starts_at:day.startsAt,ends_at:day.endsAt,afternoon_starts_at:day.afternoonStartsAt,afternoon_ends_at:day.afternoonEndsAt}))};
  assert.equal(semesterStatus({requiredHours:20,verifiedHours:10,remainingHours:10,deadline:basis.endsOn,today:basis.today,schedule}),'on_track');
  assert.equal(semesterStatus({requiredHours:20,verifiedHours:9.99,remainingHours:10.01,deadline:basis.endsOn,today:basis.today,schedule}),'at_risk');
});
test('today recorded hours cannot be counted again as future capacity',()=>{
  assert.equal(catchUpCapacity({days,startsOn:'2026-11-16',endsOn:'2026-11-16',today:'2026-11-16',recordedHoursToday:2}),3);
});
test('suggestions preserve existing days, avoid Sunday and fit permitted time windows and daily maximums',()=>{
  const original=structuredClone(days);
  const options=catchUpCandidates({days,requirement});
  assert.ok(options.some(option=>option.kind==='extend'));
  assert.ok(options.some(option=>option.kind==='add'));
  assert.deepEqual(days,original);
  for(const option of options) {
    assert.ok(option.extraHoursPerWeek>0);
    assert.ok(option.weekday<=6);
    assert.equal(new Set(option.days.map(day=>day.weekday)).size,option.days.length);
    for(const day of option.days) {
      const periods=[[day.startsAt,day.endsAt],...(day.afternoonStartsAt?[[day.afternoonStartsAt,day.afternoonEndsAt]]:[])];
      let hours=0;
      for(const [from,to] of periods) {
        assert.ok(requirement.permittedTimeWindows.some(window=>from>=window.startTime&&to<=window.endTime));
        hours+=(Date.parse(`2026-01-01T${to}:00Z`)-Date.parse(`2026-01-01T${from}:00Z`))/3600000;
      }
      assert.ok(hours<=requirement.maximumDailyHours);
    }
  }
});
test('a full permitted schedule with no spare time produces no automatic option',()=>{
  assert.deepEqual(catchUpCandidates({days:[{weekday:1,startsAt:'09:00',endsAt:'12:00'}],requirement:{minimumDailyHours:3,maximumDailyHours:3,permittedWeekdays:[1],permittedTimeWindows:[{startTime:'09:00',endTime:'12:00'}]}}),[]);
});
