import Image from 'next/image';
import Link from 'next/link';
import ContactEmailLink from '../../components/contact-email-link';

const studyAreas = [
  {
    title: 'Junior Secondary',
    text: 'Adebola College provides Junior Secondary education.',
    tag: 'JSS',
  },
  {
    title: 'Senior Secondary',
    text: 'Senior Secondary students prepare for WAEC and NECO examinations.',
    tag: 'SSS',
  },
  {
    title: 'Assessment and support',
    text: 'Academic progress is assessed through tests, assignments, homework, and examinations, with tutoring support available.',
    tag: 'Learning',
  },
];

export default function AcademicsPage() {
  return (
    <>
      <section className="page-hero page-hero-compact">
        <div className="container page-hero-inner">
          <div>
            <span className="eyebrow eyebrow-light">Academics</span>
            <h1>Junior and Senior Secondary learning.</h1>
            <p>
              Explore Junior and Senior Secondary learning at Adebola College.
              Contact the school for its full curriculum brochure.
            </p>
            <div className="hero-actions">
              <Link href="/admissions" className="btn btn-primary">Admissions information</Link>
              <Link href="/e-learning" className="btn btn-secondary">Explore E-Learning</Link>
            </div>
          </div>
          <div className="hero-statement">
            <Image
              src="/images/NewPics/Pix25-SchoolLogo.jpg"
              alt="Adebola College crest"
              width={338}
              height={345}
              className="hero-crest"
            />
            <p>Junior Secondary<br />Senior Secondary</p>
            <span className="hero-statement-caption">Junior and Senior Secondary</span>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-header">
            <span className="eyebrow">Academic information</span>
            <h2>Learning across the secondary years.</h2>
            <p>
              Academic progress is assessed through a combination of tests,
              assignments, homework, and examinations. Tutoring support is available for students who are
              struggling academically.
            </p>
          </div>
          <div className="card-grid">
            {studyAreas.map((area) => (
              <article className="feature-card content-card" key={area.title}>
                <span className="meta-line">{area.tag}</span>
                <h3>{area.title}</h3>
                <p>{area.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="jss" className="section curriculum-section">
        <div className="container two-column">
          <div>
            <span className="eyebrow eyebrow-light">Junior Secondary</span>
            <h2>Curriculum information</h2>
            <p>Contact Adebola College for the current subject-by-subject curriculum.</p>
          </div>
          <div className="info-panel info-panel-light">
            <span className="eyebrow">Curriculum brochure</span>
            <h3>Request current subject information</h3>
            <p>Contact the College for its current Junior Secondary curriculum details.</p>
            <ContactEmailLink className="text-link">Contact Adebola College</ContactEmailLink>
          </div>
        </div>
      </section>

      <section id="sss" className="section">
        <div className="container two-column">
          <div>
            <span className="eyebrow">Senior Secondary</span>
            <h2 className="display-heading">Examination preparation.</h2>
            <p>
              Students in the third year of Senior Secondary are prepared for West African Examinations Council
              (WAEC) and National Examinations Council (NECO) examinations. The curriculum also refers to SSCE and UTME.
            </p>
            <p>Contact the College for the complete current subject and curriculum brochure.</p>
            <ContactEmailLink className="text-link">
              Request curriculum information <span aria-hidden="true">→</span>
            </ContactEmailLink>
          </div>
          <aside className="info-panel">
            <span className="eyebrow">Admissions</span>
            <h3>Transfer admissions</h3>
            <p>
              Transferring students are expected to bring transcripts and evidence
              from previous schools. Contact Admissions to confirm current requirements.
            </p>
          </aside>
        </div>
      </section>

      <section id="resources" className="section section-tight">
        <div className="container-narrow">
          <div className="section-header">
            <span className="eyebrow">Curriculum brochure</span>
            <h2>Need the complete curriculum?</h2>
            <p>Contact the College for the full curriculum brochure.</p>
          </div>
          <Link href="/contact-us" className="btn btn-outline">Contact Adebola College</Link>
        </div>
      </section>
    </>
  );
}
