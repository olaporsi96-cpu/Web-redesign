'use server';

import { createClient } from '../../../../utils/supabase/server';
import adminAuthorization from '../../../../utils/admin-authorization.cjs';
import calendarEventTypeConfig from '../../../../utils/calendar-event-types.cjs';

const { isMainAdminProfile } = adminAuthorization;
const { calendarEventTypeValues } = calendarEventTypeConfig;

async function getCalendarAdminClient() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw new Error(`Unable to verify the Admin session: ${authError.message}`);
  if (!user) throw new Error('Main Admin sign-in is required.');

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError) throw new Error(`Unable to verify the Admin profile: ${profileError.message}`);
  if (!profile || !isMainAdminProfile(profile)) throw new Error('A Main Admin account is required.');
  return { supabase, user };
}

function validateEvent(event) {
  if (!event || typeof event !== 'object') return 'Enter a calendar event.';
  if (typeof event.title !== 'string' || !event.title.trim() || event.title.trim().length > 120) {
    return 'Enter an event title of 1 to 120 characters.';
  }
  if (!calendarEventTypeValues.has(event.eventType)) return 'Choose a valid event type.';
  const dateParts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(event.eventDate || '');
  const validDate = dateParts
    && new Date(Date.UTC(Number(dateParts[1]), Number(dateParts[2]) - 1, Number(dateParts[3])))
      .toISOString().slice(0, 10) === event.eventDate;
  if (!validDate) {
    return 'Choose a valid event date.';
  }
  const validTime = (time) => time == null || time === '' || /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
  if (!validTime(event.startTime) || !validTime(event.endTime)) return 'Enter valid 24-hour event times.';
  if (event.startTime && event.endTime && event.endTime <= event.startTime) return 'End time must be after start time.';
  if (typeof event.location !== 'string' || event.location.length > 200) return 'Location must be 200 characters or fewer.';
  if (typeof event.description !== 'string' || event.description.length > 2000) return 'Description must be 2,000 characters or fewer.';
  if (!['draft', 'published'].includes(event.status)) return 'Choose a valid event status.';
  return null;
}

export async function listCalendarEvents() {
  try {
    const { supabase } = await getCalendarAdminClient();
    const { data, error } = await supabase.from('school_calendar_events')
      .select('id,title,event_type,event_date,start_time,end_time,location,description,status')
      .order('event_date', { ascending: true })
      .order('start_time', { ascending: true });
    if (error) throw new Error(`Unable to load calendar events: ${error.message}`);
    return { ok: true, events: data };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Unable to load calendar events.' };
  }
}

export async function saveCalendarEvent(event) {
  const validationError = validateEvent(event);
  if (validationError) return { ok: false, error: validationError };
  if (event.id && !/^[0-9a-f-]{36}$/i.test(event.id)) return { ok: false, error: 'The event identifier is invalid.' };

  try {
    const { supabase, user } = await getCalendarAdminClient();
    const record = {
      title: event.title.trim(),
      event_type: event.eventType,
      event_date: event.eventDate,
      start_time: event.startTime || null,
      end_time: event.endTime || null,
      location: event.location.trim(),
      description: event.description.trim(),
      status: event.status,
      updated_by: user.id,
    };
    const query = event.id
      ? supabase.from('school_calendar_events').update(record).eq('id', event.id)
      : supabase.from('school_calendar_events').insert({ ...record, created_by: user.id });
    const { error } = await query;
    if (error) throw new Error(`Unable to save the calendar event: ${error.message}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Unable to save the calendar event.' };
  }
}

export async function deleteCalendarEvent(id) {
  if (!/^[0-9a-f-]{36}$/i.test(id || '')) return { ok: false, error: 'The event identifier is invalid.' };
  try {
    const { supabase } = await getCalendarAdminClient();
    const { error } = await supabase.from('school_calendar_events').delete().eq('id', id);
    if (error) throw new Error(`Unable to delete the calendar event: ${error.message}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Unable to delete the calendar event.' };
  }
}
