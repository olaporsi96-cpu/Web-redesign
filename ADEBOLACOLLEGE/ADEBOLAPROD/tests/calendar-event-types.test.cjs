const { test } = require('node:test');
const assert = require('node:assert/strict');
const { calendarEventTypes, calendarEventTypeValues } = require('../utils/calendar-event-types.cjs');

test('calendar event types match the supported database values and readable labels', () => {
  assert.deepEqual(calendarEventTypes, [
    { value: 'event', label: 'School event' },
    { value: 'outing', label: 'Outing' },
    { value: 'holiday', label: 'Holiday' },
    { value: 'academic', label: 'Academic' },
  ]);
  assert.deepEqual([...calendarEventTypeValues].sort(), ['academic', 'event', 'holiday', 'outing']);
});

test('legacy unsupported school_event is not accepted for saving', () => {
  assert.equal(calendarEventTypeValues.has('school_event'), false);
});
