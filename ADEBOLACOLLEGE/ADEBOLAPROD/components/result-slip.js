import Image from 'next/image';

export default function ResultSlip({ student, result }) {
  return (
    <article className="result-slip" aria-label="Examination result slip">
      <header className="result-slip-header">
        <Image
          src="/images/NewPics/Pix25-SchoolLogo.jpg"
          alt="Adebola College crest"
          width={104}
          height={106}
          className="result-slip-crest"
        />
        <div>
          <p className="result-slip-school">Adebola College</p>
          <h2>Examination Result Slip</h2>
          <p className="result-slip-subtitle">Student copy</p>
        </div>
      </header>

      <dl className="result-slip-details">
        <div><dt>Student name</dt><dd>{student.name}</dd></div>
        <div><dt>Student ID</dt><dd>{student.studentNumber}</dd></div>
        <div><dt>Examination number</dt><dd>{result.examinationNumber}</dd></div>
        <div><dt>Candidate number</dt><dd>{result.candidateNumber}</dd></div>
        <div><dt>School</dt><dd>{result.school}</dd></div>
        <div><dt>Exam year</dt><dd>{result.examYear}</dd></div>
      </dl>

      <div className="result-table-wrap">
        <table className="result-subject-table">
          <thead>
            <tr>
              <th scope="col">No.</th>
              <th scope="col">Subject</th>
              <th scope="col">Score</th>
              <th scope="col">Grade</th>
              <th scope="col">Remark</th>
            </tr>
          </thead>
          <tbody>
            {result.subjects.map((subject, index) => (
              <tr key={subject.id}>
                <td>{index + 1}</td>
                <th scope="row">{subject.name}</th>
                <td>{subject.score || '—'}</td>
                <td>{subject.grade || '—'}</td>
                <td>{subject.remark || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="result-slip-status">
        <strong>Overall result status:</strong> {result.resultStatus}
      </p>

      <footer className="result-slip-footer">
        <strong>Adebola College</strong>
        <span>contactus@adebolacollege.org</span>
        <span>e-learning@adebolacollege.org</span>
        <small>Scores, grades, and remarks are entered as supplied and are not calculated by the portal.</small>
      </footer>
    </article>
  );
}
