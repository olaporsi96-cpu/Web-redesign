import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '../../../utils/supabase/server';
import CourseMaterialViewer from '../../../components/course-material-viewer';

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
    .select('id,course_id,title,lesson_code,description,duration_minutes')
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

  const [courseResult, materialsResult] = await Promise.all([
    supabase.from('courses').select('title,category').eq('id', lesson.course_id)
      .eq('status', 'published').maybeSingle(),
    supabase.from('course_materials')
      .select('id,storage_path,file_name,mime_type')
      .eq('course_id', lesson.course_id)
      .eq('lesson_id', lesson.id)
      .order('file_name'),
  ]);
  if (courseResult.error || materialsResult.error || !courseResult.data) return <LessonServiceError />;
  const { data: course } = courseResult;
  let materials;
  try {
    materials = await Promise.all((materialsResult.data || []).map(async (material) => {
      const { data, error } = await supabase.storage.from('course-materials')
        .createSignedUrl(material.storage_path, 300);
      if (error) throw error;
      return { ...material, signedUrl: data.signedUrl };
    }));
  } catch {
    return <LessonServiceError />;
  }

  return (
    <section className="container lesson-viewer-page">
      <Link className="lesson-viewer-back" href="/e-learning#platform">← Back to catalogue</Link>
      <Link className="lesson-viewer-back" href={`/e-learning/course/${encodeURIComponent(lesson.course_id)}`}>
        View course-level materials
      </Link>
      <article className="lesson-viewer-card">
        <header className="lesson-viewer-heading">
          <span>{course?.category || 'Course'}</span>
          <h1>{lesson.title}</h1>
          <div className="lesson-viewer-meta">
            <span>Course: <strong>{course?.title || 'Course'}</strong></span>
            {lesson.lesson_code && <span>Code: <strong>{lesson.lesson_code}</strong></span>}
            {lesson.duration_minutes && <span>Duration: <strong>{lesson.duration_minutes} minutes</strong></span>}
          </div>
          {lesson.description && <p className="lesson-detail-text">{lesson.description}</p>}
        </header>
        <div className="lesson-viewer-content">
          <CourseMaterialViewer
            materials={materials}
            emptyMessage="No private files have been attached to this lesson yet."
          />
        </div>
        <p className="lesson-protection-note">Private, short-lived links reduce casual copying, but cannot prevent external screen recording.</p>
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
