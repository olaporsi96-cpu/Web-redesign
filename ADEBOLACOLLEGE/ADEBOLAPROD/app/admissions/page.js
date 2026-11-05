import Link from 'next/link';

const entrancePapers = [
  { title: 'JSS1 English', file: 'JSS1-EntranceExam-English.pdf' },
  { title: 'JSS1 Mathematics', file: 'JSS1-EntranceExam-Maths.pdf' },
  { title: 'SSS1 English', file: 'SSS1-EntranceExam-English.pdf' },
  { title: 'SSS1 Mathematics', file: 'SSS1-EntranceExam-Maths.pdf' },
];

const admissionSteps = [
  'Review the entrance examination information and sample papers.',
  'Contact the College to confirm current examination dates, venue, and application instructions.',
  'Submit an application using the instructions confirmed by the Admissions team.',
  'Complete the entrance examination and await an admissions decision.',
];

export default function AdmissionsPage() {
  return (
    <>
      <section className="page-hero page-hero-compact">
        <div className="container page-hero-inner">
          <div>
            <span className="eyebrow eyebrow-light">Admissions</span>
            <h1>Take the next step toward Adebola College.</h1>
            <p>
              Admission information below is drawn from the school content supplied by the College. Confirm current
              dates and instructions directly before applying.
            </p>
            <div className="hero-actions">
              <a href="mailto:contactus@adebolacollege.org" className="btn btn-primary">Email Admissions</a>
              <Link href="/contact-us" className="btn btn-secondary">Contact details</Link>
            </div>
          </div>
          <div className="hero-statement">
            <p>Entrance examination<br />JSS1 · JSS2 · SS1 · SS2</p>
            <span className="hero-statement-caption">Entry points listed in supplied school content</span>
          </div>
        </div>
      </section>

      <section id="process" className="section">
        <div className="container two-column">
          <div>
            <span className="eyebrow">Admission process</span>
            <h2 className="display-heading">Examination-based admission.</h2>
            <p>
              The supplied content states that admission is by examination, with applications considered on merit.
              It lists JSS1 and midstream entry into JSS2, SS1, and SS2. Examination dates and venues are not listed
              in the supplied material currently available, so contact the College to confirm them.
            </p>
            <p>
              The same content says applicants are expected to have reached age 10 by September of their first year.
              Confirm the current age and entry requirements with Admissions.
            </p>
          </div>
          <ol className="step-list">
            {admissionSteps.map((step, index) => (
              <li key={step}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <p>{step}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="requirements" className="section paper-section">
        <div className="container">
          <div className="section-header section-heading-row">
            <div>
              <span className="eyebrow">Sample entrance examinations</span>
              <h2>Practice with the supplied papers.</h2>
            </div>
            <p>The school content recommends reviewing sample papers. Files open as PDFs in a new tab.</p>
          </div>
          <div className="paper-grid">
            {entrancePapers.map((paper) => (
              <a
                className="paper-card"
                href={`/downloads/admissions/${paper.file}`}
                key={paper.file}
                target="_blank"
                rel="noreferrer"
              >
                <span className="paper-icon" aria-hidden="true">PDF</span>
                <span className="paper-card-title">{paper.title}</span>
                <span className="paper-card-action">Open sample paper <span aria-hidden="true">↗</span></span>
              </a>
            ))}
          </div>
          <p className="content-note">
            Sample papers are provided for preparation. The supplied content describes examination areas including
            arithmetic, fractions, word problems, English essays, sentences, and grammar.
          </p>
        </div>
      </section>

      <section id="faq" className="section section-tight">
        <div className="container-narrow">
          <div className="section-header">
            <span className="eyebrow">Questions?</span>
            <h2>Confirm current admission details.</h2>
            <p>
              Application dates, venues, fees, and required documents are not specified in the current source
              material. Please ask the Admissions team for the latest information.
            </p>
          </div>
          <a className="btn btn-outline" href="mailto:contactus@adebolacollege.org">
            contactus@adebolacollege.org
          </a>
        </div>
      </section>
    </>
  );
}
