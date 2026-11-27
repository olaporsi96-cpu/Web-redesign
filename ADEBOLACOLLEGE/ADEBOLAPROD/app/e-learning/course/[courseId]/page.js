import Link from 'next/link';
import { redirect } from 'next/navigation';
import CourseMaterialViewer from '../../../../components/course-material-viewer';
import { createClient } from '../../../../utils/supabase/server';

export const dynamic = 'force-dynamic';

export default async function StudentCourseMaterialsPage({ params }) {
  const { courseId } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError && authError.name !== 'AuthSessionMissingError') return <CourseMaterialsError />;
  if (!user) redirect(`/student/login?next=${encodeURIComponent(`/e-learning/course/${courseId}`)}`);

  const { data: hasAccess, error: accessError } = await supabase.rpc('has_course_access', {
    requested_course_id: courseId,
  });
  if (accessError) return <CourseMaterialsError />;
  if (!hasAccess) {
    return (
      <section className="container lesson-not-found">
        <h1>Course access required</h1>
        <p>Course materials are private and require an active approved or manually granted course entitlement.</p>
        <Link className="btn btn-primary" href="/e-learning#platform">Browse courses</Link>
      </section>
    );
  }

  const [courseResult, materialsResult] = await Promise.all([
    supabase.from('courses').select('id,title,category').eq('id', courseId).eq('status', 'published').maybeSingle(),
    supabase.from('course_materials').select('id,storage_path,file_name,mime_type')
      .eq('course_id', courseId).is('lesson_id', null).order('file_name'),
  ]);
  if (courseResult.error || materialsResult.error || !courseResult.data) return <CourseMaterialsError />;

  let materials;
  try {
    materials = await Promise.all((materialsResult.data || []).map(async (material) => {
      const { data, error } = await supabase.storage.from('course-materials')
        .createSignedUrl(material.storage_path, 300);
      if (error) throw error;
      return { ...material, signedUrl: data.signedUrl };
    }));
  } catch {
    return <CourseMaterialsError />;
  }

  return (
    <section className="container lesson-viewer-page">
      <Link className="lesson-viewer-back" href="/e-learning#platform">← Back to catalogue</Link>
      <article className="lesson-viewer-card">
        <header className="lesson-viewer-heading">
          <span>{courseResult.data.category}</span>
          <h1>{courseResult.data.title}</h1>
          <p>Course-level materials</p>
        </header>
        <CourseMaterialViewer
          materials={materials}
          emptyMessage="No course-level files have been added yet."
        />
        <p className="lesson-protection-note">Private, short-lived links reduce casual copying, but cannot prevent external screen recording.</p>
      </article>
    </section>
  );
}

function CourseMaterialsError() {
  return (
    <section className="container lesson-not-found" role="alert">
      <h1>Course materials temporarily unavailable</h1>
      <p>We could not verify access or load course materials. Please try again.</p>
      <Link className="btn btn-primary" href="/e-learning#platform">Retry</Link>
    </section>
  );
}
