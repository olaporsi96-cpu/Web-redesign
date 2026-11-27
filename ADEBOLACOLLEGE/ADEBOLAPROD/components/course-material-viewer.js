export default function CourseMaterialViewer({ materials, emptyMessage }) {
  if (!materials.length) {
    return (
      <div className="lesson-viewer-placeholder">
        <h2>Materials unavailable</h2>
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="course-material-viewer">
      {materials.map((material) => (
        <article className="course-material-viewer-item" key={material.id}>
          <h2>{material.file_name}</h2>
          <a href={material.signedUrl} target="_blank" rel="noreferrer">
            Open private {material.mime_type === 'application/pdf' ? 'PDF' : 'video'}
          </a>
          {material.mime_type === 'application/pdf' ? (
            <iframe
              title={material.file_name}
              src={material.signedUrl}
              className="lesson-private-pdf"
            />
          ) : (
            <video controls preload="metadata" className="lesson-private-video">
              <source src={material.signedUrl} type="video/mp4" />
            </video>
          )}
        </article>
      ))}
    </div>
  );
}
