import { PageHeading } from './_components/admin-ui';

export function ComingSoonPage({ title, description }) {
  return (
    <>
      <PageHeading eyebrow="Later phase" title={title} description={description} />
      <section className="coming-soon-panel">
        <span className="coming-soon-icon" aria-hidden="true">◷</span>
        <span className="coming-soon-badge">COMING IN A LATER PHASE</span>
        <h2>This area is a placeholder</h2>
        <p>No student, payment, or settings functionality is connected to this screen.</p>
      </section>
    </>
  );
}
