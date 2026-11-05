import Image from 'next/image';
import Link from 'next/link';
import { createClient } from '../../utils/supabase/server';
import calendarEventTypeConfig from '../../utils/calendar-event-types.cjs';

const { calendarEventTypes } = calendarEventTypeConfig;
const calendarEventLabels = new Map(calendarEventTypes.map(({ value, label }) => [value, label]));

const developmentAreas = [
  {
    title: 'Academic learning',
    text: 'Classroom learning and group projects are described in the school content as part of the student experience.',
  },
  {
    title: 'Personal growth',
    text: 'The supplied material highlights communication, time management, and problem-solving skills.',
  },
  {
    title: 'Community involvement',
    text: 'The school content describes community involvement as part of student life and personal development.',
  },
];

export default async function StudentLifePage() {
  const supabase = await createClient();
  const lagosDateParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Lagos',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date()).reduce((parts, item) => {
    if (item.type !== 'literal') parts[item.type] = item.value;
    return parts;
  }, {});
  const todayInLagos = `${lagosDateParts.year}-${lagosDateParts.month}-${lagosDateParts.day}`;
  const { data: events, error: calendarError } = await supabase.from('school_calendar_events')
    .select('id,title,event_type,event_date,start_time,end_time,location,description')
    .eq('status', 'published')
    .gte('event_date', todayInLagos)
    .order('event_date', { ascending: true })
    .order('start_time', { ascending: true });

  function formatEventDate(date) {
    const [year, month, day] = date.split('-').map(Number);
    return new Intl.DateTimeFormat('en-NG', {
      dateStyle: 'full',
      timeZone: 'Africa/Lagos',
    }).format(new Date(Date.UTC(year, month - 1, day, 12)));
  }

  return (
    <>
      <section className="page-hero page-hero-compact">
        <div className="container page-hero-inner">
          <div>
            <span className="eyebrow eyebrow-light">Student Life</span>
            <h1>Learning, personal growth, and community.</h1>
            <p>
              The student-life information supplied by Adebola College describes a blend of academic learning,
              personal development, and community involvement.
            </p>
            <div className="hero-actions">
              <Link href="/families" className="btn btn-primary">Information for families</Link>
              <Link href="/contact-us" className="btn btn-secondary">Contact the College</Link>
            </div>
          </div>
          <div className="hero-statement">
            <p>Learn<br />Grow<br />Contribute</p>
            <span className="hero-statement-caption">Themes in the supplied student-life content</span>
          </div>
        </div>
      </section>

      <section id="activities" className="section">
        <div className="container">
          <div className="section-header">
            <span className="eyebrow">The student experience</span>
            <h2>Opportunities to learn and develop.</h2>
            <p>
              These themes reflect the supplied school overview; contact the College to confirm current activities
              and programmes.
            </p>
            <p>
              The supplied content also addresses student wellbeing. Contact the College to confirm current support
              arrangements.
            </p>
          </div>
          <div className="card-grid">
            {developmentAreas.map((area) => (
              <article className="feature-card content-card" key={area.title}>
                <h3>{area.title}</h3>
                <p>{area.text}</p>
              </article>
            ))}
          </div>
          <figure className="school-photo-card practical-photo">
            <Image
              src="/images/NewPics/Pix10-Sewing.jpeg"
              alt="Students using sewing machines during a practical skills activity."
              width={872}
              height={1163}
            />
            <figcaption>
              Students using sewing machines in a supplied school photograph. This image documents an activity and
              does not confirm a current course or programme.
            </figcaption>
          </figure>
        </div>
      </section>

      <section className="section">
        <div className="container two-column activity-photo-section">
          <div>
            <span className="eyebrow">Outdoor activity</span>
            <h2 className="display-heading">Students taking part in a field exercise.</h2>
            <p>
              The supplied photographs show students participating in outdoor field activities. They illustrate
              student activity but do not confirm a current clubs, sports, or events schedule.
            </p>
          </div>
          <figure className="school-photo-card">
            <Image
              src="/images/NewPics/Pix11-FieldExcercise.jpeg"
              alt="Students in school sportswear taking part in an outdoor field exercise."
              width={1200}
              height={900}
            />
            <figcaption>Students taking part in an outdoor field exercise.</figcaption>
          </figure>
        </div>
      </section>

      <section id="sports" className="section curriculum-section">
        <div className="container two-column">
          <div>
            <span className="eyebrow eyebrow-light">Beyond the classroom</span>
            <h2>Participation and connection.</h2>
            <p>
              The source material refers to extracurricular opportunities and explains that participation can help
              learners build confidence, explore interests, develop leadership skills, and form friendships. It does
              not identify the College’s current clubs, teams, or activity schedule.
            </p>
          </div>
          <div className="info-panel info-panel-light">
            <span className="eyebrow">Current activities</span>
            <h3>Ask the College for confirmed details.</h3>
            <p>Specific clubs, sports, facilities, and event dates are not published here without confirmation.</p>
            <Link href="/contact-us" className="text-link">Contact Adebola College <span aria-hidden="true">→</span></Link>
          </div>
        </div>
      </section>

      <section id="calendar" className="section section-tight">
        <div className="container-narrow">
          <div className="section-header">
            <span className="eyebrow">School calendar</span>
            <h2>Dates and events</h2>
            {calendarError ? (
              <p role="status">The school calendar is temporarily unavailable. Please check again later.</p>
            ) : events?.length ? (
              <div className="public-calendar-events">
                {events.map((event) => (
                  <article className="public-calendar-event" key={event.id}>
                    <span className="eyebrow">{calendarEventLabels.get(event.event_type) || 'School event'}</span>
                    <h3>{event.title}</h3>
                    <p><time dateTime={event.event_date}>{formatEventDate(event.event_date)}</time>
                      {event.start_time && ` · ${event.start_time.slice(0, 5)}`}
                      {event.end_time && `–${event.end_time.slice(0, 5)}`}
                    </p>
                    {event.location && <p>{event.location}</p>}
                    {event.description && <p>{event.description}</p>}
                  </article>
                ))}
              </div>
            ) : (
              <p>No published events are currently scheduled. Check back for updates.</p>
            )}
          </div>
          <a className="btn btn-outline" href="mailto:contactus@adebolacollege.org">
            Ask about upcoming events
          </a>
        </div>
      </section>
    </>
  );
}
