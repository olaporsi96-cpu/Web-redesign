const calendarEventTypes = [
  { value: 'event', label: 'School event' },
  { value: 'outing', label: 'Outing' },
  { value: 'holiday', label: 'Holiday' },
  { value: 'academic', label: 'Academic' },
];

const calendarEventTypeValues = new Set(calendarEventTypes.map(({ value }) => value));

module.exports = {
  calendarEventTypes,
  calendarEventTypeValues,
};
