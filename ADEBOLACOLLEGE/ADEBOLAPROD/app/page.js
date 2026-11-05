import Image from 'next/image';
import Link from 'next/link';
import HomeSpotlight from '../components/home-spotlight';

const schoolFacts = [
  { value: '2005', label: 'Founded in September' },
  { value: '2010', label: 'Kwara State operating licence' },
  { value: '2021/22', label: 'Distance learning introduced' },
];

const destinations = [
  {
    title: 'Admissions',
    text: 'Read about the entrance examination process and download the supplied sample papers.',
    href: '/admissions',
    action: 'Explore admissions',
  },
  {
    title: 'Academics',
    text: 'Explore the Junior and Senior Secondary information and selected curriculum topics.',
    href: '/academics',
    action: 'View academics',
  },
  {
    title: 'E-Learning',
    text: 'Browse the JSS, SSS, and Standardized Tests learning categories.',
    href: '/e-learning',
    action: 'Explore E-Learning',
  },
];

export default function HomePage() {
  return (
    <>
      <section className="page-hero home-hero">
        <div className="container page-hero-inner">
          <div className="home-hero-copy">
            <span className="eyebrow eyebrow-light">Adebola College · Ilorin, Kwara State</span>
            <HomeSpotlight />
            <div className="hero-actions">
              <Link href="/admissions" className="btn btn-primary">Explore admissions</Link>
              <Link href="/about-us" className="btn btn-secondary">About the College</Link>
            </div>
          </div>

          <div className="school-visual">
            <Image
              src="/images/NewPics/Pix1-Building.jpeg"
              alt="Students playing on the school field in front of a College building."
              width={960}
              height={640}
              priority
              className="school-premises-photo"
            />
            <Image
              src="/images/NewPics/Pix25-SchoolLogo.jpg"
              alt="Adebola College crest"
              width={338}
              height={345}
              className="school-visual-logo"
            />
          </div>
        </div>
      </section>

      <section className="section school-intro">
        <div className="container intro-layout">
          <div>
            <span className="eyebrow">Welcome to Adebola College</span>
            <h2 className="display-heading">A school community centred on learning and character.</h2>
          </div>
          <div>
            <p className="lead-copy">
              The College’s supplied overview describes a learning community that brings academic rigour together
              with character development, leadership, and service.
            </p>
            <Link href="/about-us" className="text-link">Discover the College <span aria-hidden="true">→</span></Link>
          </div>
        </div>
      </section>

      <section className="section section-tight">
        <div className="container">
          <div className="section-header section-heading-row">
            <div>
              <span className="eyebrow">The College</span>
              <h2>Milestones from the supplied school overview.</h2>
            </div>
            <p>Dates and details shown here are taken from the client-provided school content.</p>
          </div>
          <div className="fact-grid">
            {schoolFacts.map((fact) => (
              <article className="fact-card" key={fact.label}>
                <strong>{fact.value}</strong>
                <span>{fact.label}</span>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section pathways-section">
        <div className="container">
          <div className="section-header">
            <span className="eyebrow eyebrow-light">Explore Adebola</span>
            <h2>Find the information you need.</h2>
            <p>Learn about joining the College, academic pathways, and the E-Learning programme.</p>
          </div>
          <div className="pathway-grid">
            {destinations.map((destination) => (
              <article className="pathway-card" key={destination.title}>
                <h3>{destination.title}</h3>
                <p>{destination.text}</p>
                <Link href={destination.href} className="pathway-link">
                  {destination.action} <span aria-hidden="true">→</span>
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container two-column home-detail">
          <div className="detail-emblem" aria-hidden="true">
            <Image
              src="/images/NewPics/Pix25-SchoolLogo.jpg"
              alt=""
              width={338}
              height={345}
              className="detail-emblem-logo"
            />
          </div>
          <div>
            <span className="eyebrow">Learn beyond the classroom</span>
            <h2 className="display-heading">Discover the E-Learning categories.</h2>
            <p className="lead-copy">
              JSS, SSS, and Standardized Tests are the three categories named in the College’s supplied E-Learning
              materials.
            </p>
            <Link href="/e-learning" className="btn btn-outline">Visit E-Learning</Link>
          </div>
        </div>
      </section>

      <div className="container">
        <div className="cta-band">
          <div className="cta-band-inner">
            <div>
              <span className="eyebrow eyebrow-light">Get in touch</span>
              <h2>Have a question about Adebola College?</h2>
              <p>Contact the College for current admissions information and school enquiries.</p>
            </div>
            <Link href="/contact-us" className="btn btn-primary">Contact the College</Link>
          </div>
        </div>
      </div>
    </>
  );
}
