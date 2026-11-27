import Image from 'next/image';
import Link from 'next/link';
import ContactEmailLink from '../../components/contact-email-link';

const facilities = [
  {
    title: 'Classrooms',
    text: 'Adebola College provides classrooms for Junior and Senior Secondary students.',
  },
  {
    title: 'Library',
    text: 'The College library supports independent study, group study, and research.',
  },
  {
    title: 'Science laboratories',
    text: 'Students use the College science laboratories for practical learning.',
  },
  {
    title: 'Playground',
    text: 'A playground is part of the College facilities.',
  },
  {
    title: 'Online Learning',
    text: 'The College E-Learning programme supports learning beyond the classroom.',
  },
];

export default function AboutPage() {
  return (
    <>
      <section className="page-hero page-hero-compact">
        <div className="container page-hero-inner">
          <div>
            <span className="eyebrow eyebrow-light">About Adebola College</span>
            <h1>Learning, character, and community.</h1>
            <p>
              Adebola College is a private coeducational school in Ilorin, Kwara State, providing Junior and Senior
              Secondary education.
            </p>
            <div className="hero-actions">
              <Link href="/academics" className="btn btn-primary">Explore academics</Link>
              <Link href="/contact-us" className="btn btn-secondary">Contact the College</Link>
            </div>
          </div>
          <div className="hero-statement">
            <span className="hero-statement-mark" aria-hidden="true">“</span>
            <p>A collaborative community emphasising academic rigour and character development.</p>
            <span className="hero-statement-caption">Adebola College</span>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container two-column about-history">
          <div>
            <span className="eyebrow">Who we are</span>
            <h2 className="display-heading">A coeducational school serving learners in Ilorin.</h2>
            <p>
              Adebola College was founded in September 2005 and received a licence from the Kwara State Government
              to operate in July 2010. The College began admitting students
              in the 2006/2007 academic year and introduced a long-distance learning programme in 2021/2022.
            </p>
            <p>
              The College encourages intellectual excellence, moral character, leadership, and service.
            </p>
            <p>Location: 51 Gaa-Akanbi Road, Ilorin, Kwara State.</p>
          </div>
          <aside className="history-card" aria-label="School timeline">
            <div className="timeline-item">
              <span>September 2005</span>
              <p>Founded.</p>
            </div>
            <div className="timeline-item">
              <span>2006/2007</span>
              <p>First academic year admitting students.</p>
            </div>
            <div className="timeline-item">
              <span>July 2010</span>
              <p>Licence to operate granted by Kwara State Government.</p>
            </div>
            <div className="timeline-item">
              <span>2021/2022</span>
              <p>Long-distance learning added to the school’s offerings.</p>
            </div>
          </aside>
        </div>
      </section>

      <section id="mission" className="section statement-section">
        <div className="container statement-content">
          <span className="eyebrow eyebrow-light">Our educational direction</span>
          <h2>Academic rigour and character development.</h2>
          <p>
            “Build a collaborative community that emphasizes academic rigor and character development to foster
            innovative problem solvers and life-long learners.”
          </p>
          <div className="goals-summary">
            <h3>College values</h3>
            <p>Intellectual excellence, moral character, leadership, and service.</p>
          </div>
        </div>
      </section>

      <section id="facilities" className="section">
        <div className="container">
          <div className="section-header section-heading-row">
            <div>
              <span className="eyebrow">Facilities</span>
              <h2>Spaces for learning and school life.</h2>
            </div>
            <p>Learning and activity spaces at Adebola College.</p>
          </div>
          <div className="card-grid">
            {facilities.map((facility) => (
              <article className="feature-card content-card" key={facility.title}>
                <h3>{facility.title}</h3>
                <p>{facility.text}</p>
              </article>
            ))}
          </div>
          <div className="facility-photo-grid">
            <figure className="school-photo-card">
              <Image
                src="/images/NewPics/Pix14-Badmington.jpeg"
                alt="Students playing badminton in a courtyard between College buildings."
                width={485}
                height={1024}
              />
              <figcaption>Students playing badminton in the school courtyard.</figcaption>
            </figure>
            <figure className="school-photo-card">
              <Image
                src="/images/NewPics/Pix13-InScienceLab.jpeg"
                alt="Students in white coats working at laboratory benches."
                width={1080}
                height={720}
              />
              <figcaption>Students working in a science laboratory.</figcaption>
            </figure>
          </div>
        </div>
      </section>

      <section id="employment" className="section section-tight">
        <div className="container two-column">
          <div>
            <span className="eyebrow">Employment</span>
            <h2 className="display-heading">Interested in working with the College?</h2>
            <p>
              For employment enquiries, contact the College to ask about current opportunities and application
              instructions.
            </p>
          </div>
          <div className="contact-card contact-card-emphasis">
            <h3>Contact the College</h3>
            <p>Ask about employment enquiries and current opportunities.</p>
            <ContactEmailLink className="text-link">Contact the College <span aria-hidden="true">→</span></ContactEmailLink>
          </div>
        </div>
      </section>
    </>
  );
}
