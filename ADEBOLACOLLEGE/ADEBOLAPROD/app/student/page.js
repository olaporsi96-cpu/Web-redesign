import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { signOutStudent } from './login/actions';
import { createClient } from '../../utils/supabase/server';
import './results/results.css';

export default async function StudentDashboardPage() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError && authError.name !== 'AuthSessionMissingError') {
    return <StudentAccessError message={`Unable to verify your sign-in: ${authError.message}`} />;
  }
  if (!user) redirect('/student/login');

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError) return <StudentAccessError message={`Unable to verify your profile: ${profileError.message}`} />;
  if (profile?.role !== 'student') return <StudentAccessError message="This account does not have student portal access." />;

  const { data: student, error: studentError } = await supabase
    .from('students')
    .select('id, name, student_number, is_active')
    .eq('profile_id', user.id)
    .maybeSingle();
  if (studentError) return <StudentAccessError message={`Unable to load your student record: ${studentError.message}`} />;
  if (!student?.is_active) return <StudentAccessError message="This student account is inactive or is not linked to an active student record." />;

  const { count, error: resultsError } = await supabase
    .from('results')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', student.id)
    .eq('result_status', 'Released');
  if (resultsError) return <StudentAccessError message={`Unable to load your released-result count: ${resultsError.message}`} />;

  return (
    <section className="student-dashboard">
      <header className="student-page-header">
        <div>
          <h1>Welcome, {student.name}</h1>
          <p>Student number {student.student_number}</p>
        </div>
        <div className="student-page-actions">
          <Link className="result-button result-button-secondary" href="/student/profile">My profile</Link>
          <form action={signOutStudent}>
            <button type="submit" className="result-button result-button-secondary">Sign out</button>
          </form>
        </div>
      </header>
      <div className="student-summary-card">
        <span className="student-summary-icon" aria-hidden="true">▦</span>
        <div><span>Released results</span><strong>{count || 0}</strong></div>
        <Link href="/student/results">View results →</Link>
      </div>
      <section className="student-dashboard-panel">
        <div>
          <h2>Examination results</h2>
          <p>{count ? 'Your released results are ready to view or print.' : 'No released results are available yet.'}</p>
        </div>
        <Link className="result-button result-button-primary" href="/student/results">Open results</Link>
      </section>
    </section>
  );
}

function StudentAccessError({ message }) {
  return (
    <section className="student-access-page">
      <Image src="/images/NewPics/Pix25-SchoolLogo.jpg" alt="Adebola College crest" width={76} height={78} />
      <h1>Student sign-in required</h1>
      <p role="alert">{message}</p>
      <Link className="result-button result-button-primary" href="/student/login">Open student sign in</Link>
    </section>
  );
}
