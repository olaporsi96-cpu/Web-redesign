import Image from 'next/image';
import Link from 'next/link';

const jssTopics = [
  'Definition and importance of agriculture',
  'Types of agriculture and local agricultural practices',
  'Parts of flowering plants and their functions',
  'Classification and uses of crops',
  'Farm animals, their characteristics, and uses',
  'Weeds, pests, and methods of control',
];

const studyAreas = [
  {
    title: 'Junior Secondary',
    text: 'The supplied curriculum includes selected JSS subject topics, including Agricultural Science and Basic Science.',
    tag: 'JSS',
  },
  {
    title: 'Senior Secondary',
    text: 'The school overview describes Senior Secondary education and preparation for WAEC and NECO examinations.',
    tag: 'SSS',
  },
  {
    title: 'Assessment and support',
    text: 'The supplied academic information describes tests, assignments, homework, examinations, and tutoring support.',
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
              Explore the academic information and selected curriculum topics supplied by Adebola College.
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
            <span className="hero-statement-caption">Academic levels listed in the supplied content</span>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-header">
            <span className="eyebrow">Academic information</span>
            <h2>Learning across the secondary years.</h2>
            <p>
              The supplied school overview says academic progress is assessed through a combination of tests,
              assignments, homework, and examinations. It also describes tutoring support for students who are
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
            <span className="eyebrow eyebrow-light">Selected JSS curriculum</span>
            <h2>JSS1 Agricultural Science topics.</h2>
            <p>
              These selected topics are transcribed from the curriculum material supplied by the College.
            </p>
            <div className="content-note">
              The JSS1 Agricultural Science source file has been reported to contain Mathematics material. This
              topic list remains marked for College confirmation and must not be treated as approved lesson content.
            </div>
          </div>
          <ul className="curriculum-list">
            {jssTopics.map((topic) => (
              <li key={topic}>
                {topic}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="sss" className="section">
        <div className="container two-column">
          <div>
            <span className="eyebrow">Senior Secondary</span>
            <h2 className="display-heading">Examination preparation.</h2>
            <p>
              The supplied academic overview says students in the third year of Senior Secondary are prepared for
              West African Examinations Council (WAEC) and National Examinations Council (NECO) examinations. The
              curriculum document also refers to SSCE and UTME.
            </p>
            <p>Contact the College for the complete current subject and curriculum brochure.</p>
            <a className="text-link" href="mailto:contactus@adebolacollege.org">
              Request curriculum information <span aria-hidden="true">→</span>
            </a>
          </div>
          <aside className="info-panel">
            <span className="eyebrow">School-provided information</span>
            <h3>Transfer admissions</h3>
            <p>
              The supplied content states that transferring students are expected to bring transcripts and evidence
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
            <p>The source document refers families to the College for the full curriculum brochure.</p>
          </div>
          <Link href="/contact-us" className="btn btn-outline">Contact Adebola College</Link>
        </div>
      </section>
    </>
  );
}
