import Link from 'next/link';
import { getGuestCourseAccess } from '../../../../utils/guest-course-access';
import CourseMaterialViewer from '../../../../components/course-material-viewer';

export const dynamic = 'force-dynamic';

export default async function GuestCoursePage({ params }) {
  const { courseId } = await params;
  let access;
  try {
    access = await getGuestCourseAccess(courseId);
  } catch {
    return <GuestAccessMessage title="Course temporarily unavailable" />;
  }
  if (!access) return <GuestAccessMessage title="Course access expired or revoked" />;

  const [courseResult, lessonsResult, materialsResult] = await Promise.all([
    access.admin.from('courses').select('id,title,category,description')
      .eq('id', courseId).eq('status', 'published').maybeSingle(),
    access.admin.from('lessons').select('id,title,lesson_code,duration_minutes')
      .eq('course_id', courseId).eq('status', 'published').order('title'),
    access.admin.from('course_materials').select('id,storage_path,file_name,mime_type')
      .eq('course_id', courseId).is('lesson_id', null).order('file_name'),
  ]);
  if (courseResult.error || lessonsResult.error || materialsResult.error || !courseResult.data) {
    return <GuestAccessMessage title="Course temporarily unavailable" />;
  }
  let materials;
  try {
    materials = await Promise.all((materialsResult.data || []).map(async (material) => {
      const { data, error } = await access.admin.storage.from('course-materials')
        .createSignedUrl(material.storage_path, 300);
      if (error) throw error;
      return { ...material, signedUrl: data.signedUrl };
    }));
  } catch {
    return <GuestAccessMessage title="Course temporarily unavailable" />;
  }

  return (
    <section className="container lesson-viewer-page">
      <Link className="lesson-viewer-back" href="/e-learning#platform">← Back to catalogue</Link>
      <article className="lesson-viewer-card">
        <header className="lesson-viewer-heading">
          <span>{courseResult.data.category}</span>
          <h1>{courseResult.data.title}</h1>
          {courseResult.data.description && <p>{courseResult.data.description}</p>}
          <p>Guest course access expires {new Date(access.entitlement.expires_at).toLocaleString()}.</p>
        </header>
        <section>
          <h2>Course-level materials</h2>
          <CourseMaterialViewer materials={materials} emptyMessage="No course-level files have been added yet." />
        </section>
        <div className="lesson-viewer-content">
          {lessonsResult.data.length ? (
            <ol className="guest-lesson-list">
              {lessonsResult.data.map((lesson) => (
                <li key={lesson.id}>
                  {lesson.lesson_code && <code>{lesson.lesson_code}</code>}
                  <Link href={`/e-learning/guest/${encodeURIComponent(courseId)}/${encodeURIComponent(lesson.id)}`}>
                    {lesson.title}
                  </Link>
                  {lesson.duration_minutes && <span>{lesson.duration_minutes} min</span>}
                </li>
              ))}
            </ol>
          ) : (
            <div className="lesson-viewer-placeholder">
              <h2>No published lessons</h2>
              <p>Published lesson materials will appear here when available.</p>
            </div>
          )}
        </div>
      </article>
    </section>
  );
}

function GuestAccessMessage({ title }) {
  return (
    <section className="container lesson-not-found" role="status">
      <h1>{title}</h1>
      <p>Use a current course-access link from the email sent after payment approval, or contact the College.</p>
      <Link className="btn btn-primary" href="/e-learning#platform">Browse courses</Link>
    </section>
  );
}
