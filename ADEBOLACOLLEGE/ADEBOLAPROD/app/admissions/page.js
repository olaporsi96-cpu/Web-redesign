import Link from 'next/link';
import ContactEmailLink from '../../components/contact-email-link';

const entrancePapers = [
  { title: 'JSS1 English', file: 'JSS1-EntranceExam-English.pdf' },
  { title: 'JSS1 Mathematics', file: 'JSS1-EntranceExam-Maths.pdf' },
  { title: 'SS1 English', file: 'SSS1-EntranceExam-English.pdf' },
  { title: 'SS1 Mathematics', file: 'SSS1-EntranceExam-Maths.pdf' },
];

const admissionSteps = [
  'Admission to Adebola College is through examination.',
  'Admission is offered on merit and granted in order of application.',
  'Check the school website newsletters for entrance examination dates and venues.',
];

const admissionQuestions = [
  {
    id: 'faq-age',
    question: 'What is the expected age for admission?',
    answer: 'Students are expected to have reached the age of 10 by September of their first year.',
  },
  {
    id: 'faq-entry-years',
    question: 'Which year groups are listed for admission?',
    answer: 'Adebola College usually admits JSS1 students and midstream students into JSS2, SS1, and SS2.',
  },
  {
    id: 'faq-method',
    question: 'How is admission granted?',
    answer: 'Admission is through examination, is offered on merit, and is granted in order of application.',
  },
  {
    id: 'faq-exam',
    question: 'What does the entrance examination cover?',
    answer: 'Areas include arithmetic, fractions, word problems, English essays, sentences, grammar, and other topics.',
  },
  {
    id: 'faq-dates',
    question: 'Where can I find examination dates and venues?',
    answer: 'Check the school website newsletters for important entrance examination dates and venues.',
  },
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
              Admission is through examination. Applications are considered on merit, and admission is granted in
              order of application.
            </p>
            <p>
              The College offers academic, athletic, and arts programmes alongside character-building activities.
            </p>
            <div className="hero-actions">
              <ContactEmailLink className="btn btn-primary">Email Admissions</ContactEmailLink>
              <Link href="/contact-us" className="btn btn-secondary">Contact details</Link>
            </div>
          </div>
          <div className="hero-statement">
            <p>Entrance examination<br />JSS1 · JSS2 · SS1 · SS2</p>
            <span className="hero-statement-caption">Entry points at Adebola College</span>
          </div>
        </div>
      </section>

      <section id="process" className="section">
        <div className="container two-column">
          <div>
            <span className="eyebrow">Admission process</span>
            <h2 className="display-heading">Admission by examination.</h2>
            <p>
              Student enrollment is open to students expected to have reached age 10 by September of their first
              year. Admission is through an ongoing examination and is offered on merit. Adebola College usually
              admits JSS1 students and midstream students into JSS2, SS1, and SS2.
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
              <h2>Review the sample papers.</h2>
            </div>
            <p>Prospective students are recommended to review the sample entrance examination papers.</p>
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
            The entrance examination covers arithmetic, fractions, word problems, English essays, sentences, grammar,
            and other areas.
          </p>
        </div>
      </section>

      <section id="cbt-registration" className="section curriculum-section">
        <div className="container two-column">
          <div>
            <span className="eyebrow eyebrow-light">CBT exam registration</span>
            <h2>Computer-Based Testing</h2>
            <p>Adebola College facilitates Computer-Based Testing (CBT) for examination bodies such as JAMB and WAEC.</p>
            <p>JAMB Enrollment (Registration Fee - #40,000)</p>
            <p>WAEC Enrollment Form (Registration Fee - #30,000)</p>
          </div>
          <div className="info-panel info-panel-light">
            <span className="eyebrow">CBT examination fees</span>
            <h3>Payment account</h3>
            <p>Bank: GTB Bank</p>
            <p>Account #: 0008456903</p>
            <p>Send proof of payment to <a href="mailto:contactus@adebola.org">contactus@adebola.org</a>.</p>
            <p>For additional information about CBT examination registration, contact the College at contactus@adebola.org.</p>
          </div>
        </div>
      </section>

      <section id="faq" className="section section-tight">
        <div className="container-narrow">
          <div className="section-header">
            <span className="eyebrow">Admissions FAQ</span>
            <h2>Frequently asked questions</h2>
          </div>
          <nav className="faq-navigation" aria-label="Admissions frequently asked questions">
            {admissionQuestions.map((item) => <a key={item.id} href={`#${item.id}`}>{item.question}</a>)}
          </nav>
          <div className="faq-list">
            {admissionQuestions.map((item) => (
              <article className="faq-item" id={item.id} key={item.id}>
                <h3>{item.question}</h3>
                <p>{item.answer}</p>
              </article>
            ))}
          </div>
          <p>For Admissions enquiries, contact <ContactEmailLink />.</p>
        </div>
      </section>
    </>
  );
}
