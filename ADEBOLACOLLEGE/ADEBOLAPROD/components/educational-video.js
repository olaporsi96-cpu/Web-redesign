export default function EducationalVideo({ src }) {
  return (
    <section className="section educational-video-section" aria-labelledby="educational-video-title">
      <div className="container">
        <div className="section-header">
          <span className="eyebrow">Learning video</span>
          <h2 id="educational-video-title">A resource for curious learners</h2>
        </div>
        {src ? (
          <video className="educational-video-player" controls preload="metadata">
            <source src={src} type="video/mp4" />
            Your browser does not support video playback.
          </video>
        ) : (
          <div className="educational-video-placeholder" role="status">
            <span className="educational-video-placeholder-icon" aria-hidden="true">▶</span>
            <div><h3>Educational video coming soon</h3><p>This is a temporary placeholder. A College-approved educational video will appear here when supplied and published.</p></div>
          </div>
        )}
      </div>
    </section>
  );
}
