import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '../../../utils/supabase/server';

export const dynamic = 'force-dynamic';

export default async function LessonViewerPage({ params }) {
  const { lessonId } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError && authError.name !== 'AuthSessionMissingError') {
    return <LessonServiceError />;
  }
  if (!user) redirect(`/student/login?next=${encodeURIComponent(`/e-learning/${lessonId}`)}`);

  const { data: lesson, error: lessonError } = await supabase.from('lessons')
    .select('id,course_id,title,lesson_code')
    .eq('id', lessonId)
    .eq('status', 'published')
    .maybeSingle();
  if (lessonError) return <LessonServiceError />;
  if (!lesson) {
    return (
      <section className="container lesson-not-found">
        <h1>Lesson unavailable</h1>
        <p>This lesson was not found or is not currently published.</p>
        <Link className="btn btn-primary" href="/e-learning#platform">Back to catalogue</Link>
      </section>
    );
  }

  const { data: hasAccess, error: accessError } = await supabase.rpc('has_course_access', {
    requested_course_id: lesson.course_id,
  });
  if (accessError) return <LessonServiceError />;
  if (!hasAccess) {
    return (
      <section className="container lesson-not-found">
        <h1>Course access required</h1>
        <p>Lesson content is private. Access becomes available only after an Admin approves a payment or manually grants access.</p>
        <Link className="btn btn-primary" href="/e-learning#platform">Browse courses</Link>
      </section>
    );
  }

  const [courseResult, materialResult] = await Promise.all([
    supabase.from('courses').select('title,category').eq('id', lesson.course_id).maybeSingle(),
    supabase.from('course_materials').select('storage_path,file_name,mime_type').eq('lesson_id', lesson.id).maybeSingle(),
  ]);
  if (courseResult.error || materialResult.error || !courseResult.data) return <LessonServiceError />;
  const { data: course } = courseResult;
  const { data: material } = materialResult;
  let signedUrl = null;
  if (material) {
    const { data, error } = await supabase.storage.from('course-materials').createSignedUrl(material.storage_path, 60);
    if (error) return <LessonServiceError />;
    signedUrl = data.signedUrl;
  }

  return (
    <section className="container lesson-viewer-page">
      <Link className="lesson-viewer-back" href="/e-learning#platform">← Back to catalogue</Link>
      <article className="lesson-viewer-card">
        <header className="lesson-viewer-heading">
          <span>{course?.category || 'Course'}</span>
          <h1>{lesson.title}</h1>
          <div className="lesson-viewer-meta">
            <span>Course: <strong>{course?.title || 'Course'}</strong></span>
            {lesson.lesson_code && <span>Code: <strong>{lesson.lesson_code}</strong></span>}
          </div>
        </header>
        <div className="lesson-viewer-content">
          {!material ? <div className="lesson-viewer-placeholder"><h2>Lesson material unavailable</h2><p>No file has been attached to this lesson yet.</p></div>
            : !signedUrl ? <div className="lesson-viewer-placeholder"><h2>Unable to load lesson material</h2><p>Try again or contact the College.</p></div>
              : material.mime_type === 'application/pdf'
                ? <iframe title={lesson.title} src={signedUrl} className="lesson-private-pdf" />
                : <video controls preload="metadata" className="lesson-private-video"><source src={signedUrl} type="video/mp4" /></video>}
        </div>
      </article>
    </section>
  );
}

function LessonServiceError() {
  return (
    <section className="container lesson-not-found" role="alert">
      <h1>Lesson temporarily unavailable</h1>
      <p>We could not verify access or load lesson information. Please try again.</p>
      <Link className="btn btn-primary" href="/e-learning#platform">Retry</Link>
    </section>
  );
}
