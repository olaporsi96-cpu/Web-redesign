import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { signOutStudent } from '../login/actions';
import { createClient } from '../../../utils/supabase/server';
import '../results/results.css';

export default async function StudentProfilePage() {
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
    .select('name, student_number, email, is_active')
    .eq('profile_id', user.id)
    .maybeSingle();
  if (studentError) return <StudentAccessError message={`Unable to load your student record: ${studentError.message}`} />;
  if (!student?.is_active) return <StudentAccessError message="This student account is inactive or is not linked to an active student record." />;

  return (
    <section className="student-profile-page">
      <Link className="student-profile-back" href="/student">← Student dashboard</Link>
      <h1>My profile</h1>
      <dl className="student-profile-details">
        <div><dt>Name</dt><dd>{student.name}</dd></div>
        <div><dt>Student number</dt><dd>{student.student_number}</dd></div>
        <div><dt>Email</dt><dd>{student.email || user.email || '—'}</dd></div>
      </dl>
      <div className="student-page-actions">
        <Link className="result-button result-button-primary" href="/student/results">View released results</Link>
        <form action={signOutStudent}>
          <button type="submit" className="result-button result-button-secondary">Sign out</button>
        </form>
      </div>
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
