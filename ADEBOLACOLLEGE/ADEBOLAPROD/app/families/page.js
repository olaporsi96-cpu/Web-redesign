import Link from 'next/link';
import ContactEmailLink from '../../components/contact-email-link';

const waysToHelp = [
  {
    title: 'School volunteering',
    text: 'Volunteer services are coordinated by the College Administrative Office.',
  },
  {
    title: 'Share time and skills',
    text: 'Parents can ask about volunteering as unpaid substitute teachers or sharing life skills.',
  },
  {
    title: 'Community involvement',
    text: 'Students are encouraged to volunteer in their communities.',
  },
];

export default function FamiliesPage() {
  return (
    <>
      <section className="page-hero page-hero-compact">
        <div className="container page-hero-inner">
          <div>
            <span className="eyebrow eyebrow-light">Families</span>
            <h1>Working together in support of students.</h1>
            <p>
              Adebola College welcomes parent support and encourages students to contribute to their communities.
            </p>
            <div className="hero-actions">
              <Link href="/contact-us" className="btn btn-primary">Contact the College</Link>
              <Link href="/admissions" className="btn btn-secondary">Admissions information</Link>
            </div>
          </div>
          <div className="hero-statement">
            <p>Family partnership<br />Student support</p>
            <span className="hero-statement-caption">Adebola College families</span>
          </div>
        </div>
      </section>

      <section id="resources" className="section">
        <div className="container">
          <div className="section-header">
            <span className="eyebrow">Family support</span>
            <h2>Ways families can take part.</h2>
            <p>
              Parents are encouraged to support appropriate dress and conduct in and outside the school premises.
            </p>
          </div>
          <div className="card-grid">
            {waysToHelp.map((item) => (
              <article className="feature-card content-card" key={item.title}>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="communication" className="section curriculum-section">
        <div className="container two-column">
          <div>
            <span className="eyebrow eyebrow-light">Volunteering</span>
            <h2>Share your time, energy, and skills.</h2>
            <p>
              Volunteer services are coordinated by the Administrative Office. Parents interested in volunteering
              can contact the College about current opportunities and arrangements.
            </p>
          </div>
          <div className="info-panel info-panel-light">
            <span className="eyebrow">Students and community</span>
            <h3>Ask about student volunteering.</h3>
            <p>Students are encouraged to volunteer in their communities.</p>
            <ContactEmailLink className="text-link">Contact the College <span aria-hidden="true">→</span></ContactEmailLink>
          </div>
        </div>
      </section>

      <section id="support" className="section section-tight">
        <div className="container two-column">
          <div>
            <span className="eyebrow">Supporting the College</span>
            <h2 className="display-heading">Ask about approved ways to help.</h2>
            <p>
              Families can ask about supporting the College with school books, science-lab equipment, and vehicles.
              Contact the College to discuss current needs and arrangements.
            </p>
          </div>
          <div className="contact-card contact-card-emphasis">
            <h3>Family enquiries</h3>
            <p>Contact the College Administrative Office for current volunteering and support information.</p>
            <Link href="/contact-us" className="btn btn-outline">Contact the College</Link>
          </div>
        </div>
      </section>
    </>
  );
}
