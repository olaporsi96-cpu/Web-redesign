import Image from 'next/image';
import Link from 'next/link';

const facilities = [
  {
    title: 'Classrooms',
    text: 'The supplied school overview describes classrooms for JSS1–JSS3 and SS1–SS3.',
  },
  {
    title: 'Library',
    text: 'The school content describes a library for independent study, group study, and research.',
  },
  {
    title: 'Science laboratories and playground',
    text: 'Science laboratories and a playground are listed in the supplied facilities description.',
  },
  {
    title: 'Online learning',
    text: 'The school overview describes an E-Learning programme as part of the College’s learning environment.',
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
            <span className="hero-statement-caption">Adebola College · supplied school content</span>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container two-column about-history">
          <div>
            <span className="eyebrow">Who we are</span>
            <h2 className="display-heading">A coeducational school serving learners in Ilorin.</h2>
            <p>
              According to the supplied school overview, Adebola College was founded in September 2005 and received
              a licence from the Kwara State Government to operate in July 2010. The College began admitting students
              in the 2006/2007 academic year and introduced a long-distance learning programme in 2021/2022.
            </p>
            <p>
              The overview describes the school as a community that encourages intellectual excellence, moral
              character, leadership, and service.
            </p>
            <p>Location listed in the supplied school information: 51 Gaa-Akanbi Road, Ilorin, Kwara State.</p>
          </div>
          <aside className="history-card" aria-label="School timeline">
            <div className="timeline-item">
              <span>September 2005</span>
              <p>Founded, according to the supplied school overview.</p>
            </div>
            <div className="timeline-item">
              <span>2006/2007</span>
              <p>First academic year admitting students.</p>
            </div>
            <div className="timeline-item">
              <span>July 2010</span>
              <p>Kwara State operating licence date listed in the overview.</p>
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
          <div className="content-note">
            The supplied overview labels this statement as the College’s mission, while a JSS entrance paper labels
            similar wording as its vision. It is presented here without choosing either label pending confirmation.
          </div>
          <div className="goals-summary">
            <h3>Goals and values described in the overview</h3>
            <p>Intellectual excellence, moral character, leadership, and service.</p>
          </div>
        </div>
      </section>

      <section id="facilities" className="section">
        <div className="container">
          <div className="section-header section-heading-row">
            <div>
              <span className="eyebrow">Facilities</span>
              <h2>Spaces described in the school overview.</h2>
            </div>
            <p>The supplied photographs below show school premises, student activity, and a science laboratory.</p>
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
              The supplied content invites prospective applicants to contact the school with an up-to-date resume.
              The email address in that section ends in `.edu` and differs from the client-confirmed `.org` address;
              use the confirmed contact address to request current instructions.
            </p>
          </div>
          <div className="contact-card contact-card-emphasis">
            <h3>Contact the College</h3>
            <p>Ask about employment enquiries and current opportunities.</p>
            <a className="text-link" href="mailto:contactus@adebolacollege.org">
              contactus@adebolacollege.org <span aria-hidden="true">→</span>
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
