'use client';

import { useEffect, useState } from 'react';
import { EmptyState, PageHeading } from '../../_components/admin-ui';
import { deleteCalendarEvent, listCalendarEvents, saveCalendarEvent } from './actions';
import calendarEventTypeConfig from '../../../../utils/calendar-event-types.cjs';

const { calendarEventTypes: eventTypeOptions, calendarEventTypeValues } = calendarEventTypeConfig;

const blankEvent = {
  title: '',
  eventType: 'event',
  eventDate: '',
  startTime: '',
  endTime: '',
  location: '',
  description: '',
  status: 'draft',
};

function eventDateLabel(date) {
  const [year, month, day] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('en-NG', {
    dateStyle: 'full',
    timeZone: 'Africa/Lagos',
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

export default function CalendarAdminPage() {
  const [events, setEvents] = useState([]);
  const [form, setForm] = useState(blankEvent);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function refresh() {
    setLoading(true);
    setError('');
    try {
      const response = await listCalendarEvents();
      if (response.ok) setEvents(response.events);
      else setError(response.error);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load calendar events.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await saveCalendarEvent(form);
      if (!response.ok) {
        setError(response.error);
        return;
      }
      setForm(blankEvent);
      setMessage('Calendar event saved.');
      await refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save the calendar event.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(event) {
    if (!window.confirm(`Delete “${event.title}” from the school calendar?`)) return;
    setError('');
    try {
      const response = await deleteCalendarEvent(event.id);
      if (!response.ok) setError(response.error);
      else {
        setMessage('Calendar event deleted.');
        await refresh();
      }
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete the calendar event.');
    }
  }

  return (
    <>
      <PageHeading title="School calendar" description="Create and publish school events and outings. Dates and times use the Africa/Lagos timezone." />
      {error && <p className="admin-auth-error" role="alert">{error}</p>}
      {message && <p className="admin-info-callout" role="status">{message}</p>}
      <section className="admin-panel calendar-admin-panel">
        <div className="panel-heading"><div><h2>{form.id ? 'Edit event' : 'Add an event'}</h2><p>Unpublished events remain private to Admins.</p></div></div>
        <form className="admin-form calendar-event-form" onSubmit={submit}>
          <label>Event title<input required maxLength={120} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
          <label>Type<select value={form.eventType} onChange={(event) => setForm({ ...form, eventType: event.target.value })}>{eventTypeOptions.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Date<input type="date" required value={form.eventDate} onChange={(event) => setForm({ ...form, eventDate: event.target.value })} /></label>
          <label>Start time (optional)<input type="time" value={form.startTime} onChange={(event) => setForm({ ...form, startTime: event.target.value })} /></label>
          <label>End time (optional)<input type="time" value={form.endTime} onChange={(event) => setForm({ ...form, endTime: event.target.value })} /></label>
          <label>Location<input maxLength={200} value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} /></label>
          <label className="calendar-description-field">Description<textarea rows={3} maxLength={2000} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
          <label>Status<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}><option value="draft">Draft</option><option value="published">Published</option></select></label>
          <div className="dialog-actions calendar-form-actions">
            {form.id && <button type="button" className="admin-button button-secondary" onClick={() => setForm(blankEvent)}>Cancel edit</button>}
            <button type="submit" className="admin-button button-primary" disabled={saving}>{saving ? 'Saving…' : form.id ? 'Save changes' : 'Add event'}</button>
          </div>
        </form>
      </section>
      <section className="admin-panel calendar-event-list">
        <div className="panel-heading"><div><h2>Scheduled events</h2><p>{events.length} event{events.length === 1 ? '' : 's'}</p></div></div>
        {loading ? <p className="admin-empty-inline" role="status">Loading calendar…</p>
          : error && !events.length ? <p className="admin-empty-inline">Calendar records could not be loaded.</p>
            : events.length ? events.map((event) => (
              <article className="calendar-event-card" key={event.id}>
                <div><h3>{event.title}</h3><p>{eventDateLabel(event.event_date)}{event.start_time ? ` · ${event.start_time.slice(0, 5)}` : ''}{event.end_time ? `–${event.end_time.slice(0, 5)}` : ''} · {event.location || 'Location to be confirmed'}</p><p>{event.description}</p></div>
                <span className={`status-badge${event.status === 'published' ? ' status-published' : ' status-draft'}`}>{event.status}</span>
                <div className="row-actions"><button type="button" className="text-button" onClick={() => {
                  if (!calendarEventTypeValues.has(event.event_type)) {
                    setError('This event has an unsupported type and cannot be edited until its data is corrected.');
                    return;
                  }
                  setError('');
                  setForm({ id: event.id, title: event.title, eventType: event.event_type, eventDate: event.event_date, startTime: event.start_time?.slice(0, 5) || '', endTime: event.end_time?.slice(0, 5) || '', location: event.location, description: event.description, status: event.status });
                }}>Edit</button><button type="button" className="text-button text-danger" onClick={() => remove(event)}>Delete</button></div>
              </article>
            )) : <EmptyState title="No calendar events yet" description="Add an event or outing, then publish it to display it on the public school calendar." />}
      </section>
    </>
  );
}
