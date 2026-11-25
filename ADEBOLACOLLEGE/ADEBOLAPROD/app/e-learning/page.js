import Link from 'next/link';
import ContactEmailLink from '../../components/contact-email-link';
import LearningCatalogue from '../../components/learning-catalogue';
import EducationalVideo from '../../components/educational-video';
import { createClient } from '../../utils/supabase/server';

export const dynamic = 'force-dynamic';

export default async function ELearningPage() {
  const supabase = await createClient();
  const [coursesResponse, paymentSettingsResponse, featureVideoResponse] = await Promise.all([
    supabase.from('courses')
      .select('id,title,category,description,price')
      .eq('status', 'published')
      .order('title'),
    supabase.from('course_payment_settings')
      .select('bank_name,account_name,account_number,account_type')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from('elearning_feature_settings')
      .select('video_path,published')
      .eq('id', true)
      .maybeSingle(),
  ]);
  const { data: courses, error: coursesError } = coursesResponse;
  let lessons = [];
  let lessonsError = null;
  const courseIds = (courses || []).map((course) => course.id);
  if (!coursesError && courseIds.length) {
    const response = await supabase.from('lessons')
      .select('id,course_id,title,lesson_code,description,duration_minutes')
      .in('course_id', courseIds)
      .eq('status', 'published')
      .order('title');
    lessons = response.data || [];
    lessonsError = response.error;
  }
  const { data: paymentSettings, error: paymentSettingsError } = paymentSettingsResponse;
  const { data: featureVideo } = featureVideoResponse;
  const catalogueError = coursesError || lessonsError || paymentSettingsError;
  const featureVideoUrl = featureVideo?.published && featureVideo.video_path
    ? supabase.storage.from('elearning-public-media').getPublicUrl(featureVideo.video_path).data.publicUrl
    : '';

  return (
    <>
      <section className="page-hero page-hero-compact">
        <div className="container page-hero-inner">
          <div>
            <span className="eyebrow eyebrow-light">Adebola College · E-Learning</span>
            <h1>Learning resources for different pathways.</h1>
            <p>
              The E-Learning programme provides a flexible digital learning environment that complements classroom
              learning and supports independent study.
            </p>
            <div className="hero-actions">
              <ContactEmailLink type="elearning" className="btn btn-primary">E-Learning enquiries</ContactEmailLink>
              <Link href="/academics" className="btn btn-secondary">Academic information</Link>
            </div>
          </div>
          <div className="hero-statement">
            <span className="hero-statement-mark" aria-hidden="true">e</span>
            <p>Study at your pace.<br />Learn from anywhere.</p>
            <span className="hero-statement-caption">Learn at your pace. Learn from anywhere.</span>
          </div>
        </div>
      </section>

      <section id="platform" className="section">
        <div className="container">
          {catalogueError ? (
            <div className="catalogue-empty" role="alert">
              <h2>Course catalogue temporarily unavailable</h2>
              <p>We could not load course or bank-transfer information. Please try again.</p>
              <a className="btn btn-outline" href="/e-learning#platform">Retry</a>
            </div>
          ) : (
            <LearningCatalogue courses={courses || []} lessons={lessons} paymentSettings={paymentSettings} />
          )}
        </div>
      </section>

      <EducationalVideo src={featureVideoUrl} />

      <section id="courses" className="section curriculum-section">
        <div className="container two-column">
          <div>
            <span className="eyebrow eyebrow-light">The learning experience</span>
            <h2>Designed to complement classroom learning.</h2>
            <p>Browse current courses and lessons. Protected lesson materials are delivered only to learners with an approved course-access grant.</p>
          </div>
          <div className="info-panel info-panel-light">
            <span className="eyebrow">Standardized Tests</span>
            <h3>Preparation areas</h3>
            <p>GMAT, NECO, GRE (General), SAT, IGSCE (Cambridge), WAEC, and JAMB.</p>
          </div>
        </div>
      </section>

      <section id="support" className="section section-tight">
        <div className="container-narrow">
          <div className="section-header">
            <span className="eyebrow">E-Learning support</span>
            <h2>Questions about lessons or resources?</h2>
            <p>For course enquiries or assistance with a bank-transfer submission, contact the College.</p>
          </div>
          <ContactEmailLink type="elearning" className="btn btn-outline" />
        </div>
      </section>
    </>
  );
}
