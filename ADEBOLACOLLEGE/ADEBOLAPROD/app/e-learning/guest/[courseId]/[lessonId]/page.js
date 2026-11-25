import Link from 'next/link';
import { getGuestCourseAccess } from '../../../../../utils/guest-course-access';

export const dynamic = 'force-dynamic';

export default async function GuestLessonPage({ params }) {
  const { courseId, lessonId } = await params;
  let access;
  try {
    access = await getGuestCourseAccess(courseId);
  } catch {
    return <GuestLessonMessage title="Lesson temporarily unavailable" />;
  }
  if (!access) return <GuestLessonMessage title="Course access expired or revoked" />;

  const [lessonResult, courseResult] = await Promise.all([
    access.admin.from('lessons').select('id,course_id,title,lesson_code,description,duration_minutes')
      .eq('id', lessonId).eq('course_id', courseId).eq('status', 'published').maybeSingle(),
    access.admin.from('courses').select('title,category').eq('id', courseId).maybeSingle(),
  ]);
  if (lessonResult.error || courseResult.error || !lessonResult.data || !courseResult.data) {
    return <GuestLessonMessage title="Lesson temporarily unavailable" />;
  }

  const { data: material, error: materialError } = await access.admin.from('course_materials')
    .select('storage_path,file_name,mime_type').eq('lesson_id', lessonId).maybeSingle();
  if (materialError) return <GuestLessonMessage title="Lesson temporarily unavailable" />;

  let signedUrl = null;
  if (material) {
    const { data, error } = await access.admin.storage.from('course-materials')
      .createSignedUrl(material.storage_path, 300);
    if (error) return <GuestLessonMessage title="Lesson temporarily unavailable" />;
    signedUrl = data.signedUrl;
  }

  return (
    <section className="container lesson-viewer-page">
      <Link className="lesson-viewer-back" href={`/e-learning/guest/${encodeURIComponent(courseId)}`}>
        ← Back to course
      </Link>
      <article className="lesson-viewer-card">
        <header className="lesson-viewer-heading">
          <span>{courseResult.data.category}</span>
          <h1>{lessonResult.data.title}</h1>
          <div className="lesson-viewer-meta">
            <span>Course: <strong>{courseResult.data.title}</strong></span>
            {lessonResult.data.lesson_code && <span>Code: <strong>{lessonResult.data.lesson_code}</strong></span>}
            {lessonResult.data.duration_minutes && <span>Duration: <strong>{lessonResult.data.duration_minutes} minutes</strong></span>}
          </div>
          {lessonResult.data.description && <p className="lesson-detail-text">{lessonResult.data.description}</p>}
        </header>
        <div className="lesson-viewer-content">
          {!material ? <div className="lesson-viewer-placeholder"><h2>Lesson material unavailable</h2><p>No file has been attached to this lesson yet.</p></div>
            : material.mime_type === 'application/pdf'
              ? <iframe title={lessonResult.data.title} src={signedUrl} className="lesson-private-pdf" />
              : <video controls preload="metadata" className="lesson-private-video"><source src={signedUrl} type="video/mp4" /></video>}
        </div>
        <p className="lesson-protection-note">Private, short-lived links reduce casual copying, but cannot prevent external screen recording.</p>
      </article>
    </section>
  );
}

function GuestLessonMessage({ title }) {
  return (
    <section className="container lesson-not-found" role="status">
      <h1>{title}</h1>
      <p>Use a current course-access link from the email sent after payment approval, or contact the College.</p>
      <Link className="btn btn-primary" href="/e-learning#platform">Browse courses</Link>
    </section>
  );
}
