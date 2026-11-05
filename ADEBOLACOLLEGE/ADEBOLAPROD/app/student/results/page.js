import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { signOutStudent } from '../login/actions';
import { createClient } from '../../../utils/supabase/server';
import ResultSlip from '../../../components/result-slip';
import PrintButton from './print-button';
import './results.css';

export default async function StudentResultsPage() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError && authError.name !== 'AuthSessionMissingError') {
    return <ResultsError message={`Unable to verify your sign-in: ${authError.message}`} />;
  }
  if (!user) redirect('/student/login');

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) {
    return <ResultsError message={`Unable to verify your student profile: ${profileError.message}`} />;
  }
  if (profile?.role !== 'student') {
    return <ResultsError message="This account does not have student portal access." />;
  }

  const { data: student, error: studentError } = await supabase
    .from('students')
    .select('id, name, student_number, is_active')
    .eq('profile_id', user.id)
    .maybeSingle();

  if (studentError) {
    return <ResultsError message={`Unable to load your student record: ${studentError.message}`} />;
  }
  if (!student?.is_active) {
    return <ResultsError message="This student account is inactive or is not linked to an active student record." />;
  }

  const { data: resultRows, error: resultsError } = await supabase
    .from('results')
    .select('id, examination_number, candidate_number, school, exam_year, result_status')
    .eq('student_id', student.id)
    .eq('result_status', 'Released')
    .order('updated_at', { ascending: false });

  if (resultsError) {
    return <ResultsError message={`Unable to load your released results: ${resultsError.message}`} />;
  }

  const resultIds = resultRows.map((result) => result.id);
  let subjectRows = [];
  if (resultIds.length) {
    const { data, error } = await supabase
      .from('result_subjects')
      .select('id, result_id, name, score, grade, remark, sort_order')
      .in('result_id', resultIds)
      .order('sort_order');

    if (error) {
      return <ResultsError message={`Unable to load your result subjects: ${error.message}`} />;
    }
    subjectRows = data;
  }

  const subjectsByResult = new Map();
  for (const subject of subjectRows) {
    const subjects = subjectsByResult.get(subject.result_id) || [];
    subjects.push({
      id: subject.id,
      name: subject.name,
      score: subject.score,
      grade: subject.grade,
      remark: subject.remark,
    });
    subjectsByResult.set(subject.result_id, subjects);
  }

  const results = resultRows.map((result) => ({
    id: result.id,
    examinationNumber: result.examination_number,
    candidateNumber: result.candidate_number,
    school: result.school,
    examYear: result.exam_year,
    resultStatus: result.result_status,
    subjects: subjectsByResult.get(result.id) || [],
  }));
  const slipStudent = {
    name: student.name,
    studentNumber: student.student_number,
  };

  return (
    <section className="student-results-page">
      <header className="student-page-header">
        <div>
          <h1>Your examination results</h1>
          <p>Signed in as {student.name} · {student.student_number}</p>
        </div>
        <div className="student-page-actions">
          <Link className="result-button result-button-secondary" href="/student">Dashboard</Link>
          <Link className="result-button result-button-secondary" href="/student/profile">My profile</Link>
          <PrintButton />
          <form action={signOutStudent}>
            <button type="submit" className="result-button result-button-secondary">Sign out</button>
          </form>
        </div>
      </header>

      <div className="result-info-note" role="note">
        Scores, grades, and remarks are entered as supplied and are not calculated by the portal.
      </div>

      {results.length ? results.map((result) => (
        <ResultSlip key={result.id} student={slipStudent} result={result} />
      )) : (
        <div className="student-no-results" role="status">
          <h2>No released results</h2>
          <p>There are no released results associated with your student account.</p>
        </div>
      )}
    </section>
  );
}

function ResultsError({ message }) {
  return (
    <section className="student-access-page">
      <Image src="/images/NewPics/Pix25-SchoolLogo.jpg" alt="Adebola College crest" width={76} height={78} />
      <h1>Unable to show results</h1>
      <p role="alert">{message}</p>
      <Link className="result-button result-button-secondary" href="/student/results">Retry</Link>
      <Link className="result-button result-button-primary" href="/student/login">Return to student sign in</Link>
    </section>
  );
}
