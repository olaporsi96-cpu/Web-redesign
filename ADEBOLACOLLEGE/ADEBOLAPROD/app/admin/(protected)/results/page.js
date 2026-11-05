'use client';

import { useEffect, useState } from 'react';
import { createClient } from '../../../../utils/supabase/client';
import { useAdmin } from '../../admin-provider';
import { ConfirmDialog, EmptyState, PageHeading } from '../../_components/admin-ui';
import ResultForm from '../../_components/result-form';
import ResultSlip from '../../../../components/result-slip';
import '../../../student/results/results.css';
import { saveResult, updateResultStatus } from './actions';

function statusClass(status) {
  return `status-badge result-status-${status.toLowerCase().replaceAll(' ', '-')}`;
}

export default function AdminResultsPage() {
  const { canAdmin } = useAdmin();
  const [students, setStudents] = useState([]);
  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [editing, setEditing] = useState(null);
  const [previewing, setPreviewing] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const [toast, setToast] = useState('');

  async function loadResults() {
    setIsLoading(true);
    setLoadError('');
    try {
      const supabase = createClient();
      const [studentResponse, resultResponse] = await Promise.all([
        supabase
          .from('students')
          .select('id, name, student_number, email, is_active')
          .order('name'),
        supabase
          .from('results')
          .select('id, student_id, examination_number, candidate_number, school, exam_year, result_status, created_at, updated_at')
          .order('updated_at', { ascending: false }),
      ]);

      if (studentResponse.error) throw new Error(studentResponse.error.message);
      if (resultResponse.error) throw new Error(resultResponse.error.message);

      const resultIds = resultResponse.data.map((result) => result.id);
      let subjects = [];
      if (resultIds.length) {
        const { data, error } = await supabase
          .from('result_subjects')
          .select('id, result_id, name, score, grade, remark, sort_order')
          .in('result_id', resultIds)
          .order('sort_order');
        if (error) throw new Error(error.message);
        subjects = data;
      }

      const subjectsByResult = new Map();
      for (const subject of subjects) {
        const resultSubjects = subjectsByResult.get(subject.result_id) || [];
        resultSubjects.push({
          id: subject.id,
          name: subject.name,
          score: subject.score,
          grade: subject.grade,
          remark: subject.remark,
        });
        subjectsByResult.set(subject.result_id, resultSubjects);
      }

      setStudents(studentResponse.data.map((student) => ({
        id: student.id,
        name: student.name,
        studentNumber: student.student_number,
        email: student.email,
        isActive: student.is_active,
      })));
      setResults(resultResponse.data.map((result) => ({
        id: result.id,
        studentId: result.student_id,
        examinationNumber: result.examination_number,
        candidateNumber: result.candidate_number,
        school: result.school,
        examYear: result.exam_year,
        resultStatus: result.result_status,
        createdAt: result.created_at,
        updatedAt: result.updated_at,
        subjects: subjectsByResult.get(result.id) || [],
      })));
    } catch (error) {
      setStudents([]);
      setResults([]);
      setLoadError(error instanceof Error ? error.message : 'Unable to load results.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadResults();
  }, []);

  async function save(record) {
    const response = await saveResult(record);
    if (response.ok) {
      setToast(record.id ? 'Result changes saved.' : 'Result created.');
      await loadResults();
    }
    return response;
  }

  async function changeStatus(id, nextStatus) {
    try {
      const response = await updateResultStatus(id, nextStatus);
      if (response.ok) {
        setToast(`Result status changed to ${nextStatus}.`);
        await loadResults();
      } else {
        setToast(response.error);
      }
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to update the result status.';
      setToast(message);
      return { ok: false, error: message };
    }
  }

  return (
    <>
      <div className="page-heading-row">
        <PageHeading
          title="Student results"
          description="Create, update, and release student result records."
        />
        <button
          type="button"
          className="admin-button button-primary"
          onClick={() => setEditing({ isNew: true })}
          disabled={isLoading || !students.length}
        >
          + Create result
        </button>
      </div>
      <div className="admin-info-callout">
        <span aria-hidden="true">ⓘ</span>
        <p>
          <strong>Result values are stored as entered.</strong> Scores and grades are not calculated.
        </p>
      </div>
      {loadError && (
        <p className="admin-auth-error" role="alert">
          Unable to load results: {loadError}{' '}
          <button type="button" className="text-button" onClick={loadResults} disabled={isLoading}>Retry</button>
        </p>
      )}
      {isLoading ? (
        <div className="admin-panel admin-empty-inline" role="status">Loading student results…</div>
      ) : loadError ? (
        <div className="admin-panel admin-empty-inline" role="status">Results are unavailable until the data connection is restored.</div>
      ) : results.length ? (
        <section className="admin-panel result-admin-panel">
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Student ID</th>
                  <th>Examination number</th>
                  <th>Exam year</th>
                  <th>Subjects</th>
                  <th>Status</th>
                  <th>Updated</th>
                  <th><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {results.map((result) => {
                  const student = students.find((item) => item.id === result.studentId);
                  return (
                    <tr key={result.id}>
                      <td><strong>{student?.name || 'Unknown student'}</strong></td>
                      <td>{student?.studentNumber || '—'}</td>
                      <td>{result.examinationNumber}</td>
                      <td>{result.examYear}</td>
                      <td>{result.subjects.length}</td>
                      <td><span className={statusClass(result.resultStatus)}>{result.resultStatus}</span></td>
                      <td>{result.updatedAt}</td>
                      <td>
                        <div className="row-actions result-row-actions">
                          <button
                            type="button"
                            className="text-button"
                            onClick={() => setPreviewing({ result, student })}
                            disabled={!student}
                          >
                            Preview
                          </button>
                          <button type="button" className="text-button" onClick={() => setEditing(result)}>Edit</button>
                          {result.resultStatus === 'Draft' && (
                            <button type="button" className="text-button" onClick={() => {
                              changeStatus(result.id, 'Ready for review');
                            }}>Submit for review</button>
                          )}
                          {result.resultStatus === 'Ready for review' && (
                            canAdmin('release_results') && (
                              <button type="button" className="text-button" onClick={() => setConfirming({ result, nextStatus: 'Released' })}>Release</button>
                            )
                          )}
                          {result.resultStatus === 'Ready for review' && (
                            <button type="button" className="text-button" onClick={() => setConfirming({ result, nextStatus: 'Draft' })}>Return to draft</button>
                          )}
                          {result.resultStatus === 'Released' && canAdmin('manage_admin_users') && (
                            <button type="button" className="text-button" onClick={() => setConfirming({ result, nextStatus: 'Draft' })}>Return to draft</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <EmptyState
          title="No results yet"
          description="Create a result and associate it with a student account."
        />
      )}
      {editing && (
        <ResultForm
          result={editing.isNew ? null : editing}
          students={students}
          onSave={save}
          onClose={() => setEditing(null)}
        />
      )}
      {confirming && (
        <ConfirmDialog
          title={confirming.nextStatus === 'Released' ? 'Release this result?' : 'Return this result to draft?'}
          description={confirming.nextStatus === 'Released'
            ? `“${confirming.result.examinationNumber}” will become visible to the selected student.`
            : `“${confirming.result.examinationNumber}” will no longer appear in the student's released-results view.`}
          confirmLabel={confirming.nextStatus === 'Released' ? 'Release result' : 'Return to draft'}
          onCancel={() => setConfirming(null)}
          onConfirm={async () => {
            await changeStatus(confirming.result.id, confirming.nextStatus);
            setConfirming(null);
          }}
        />
      )}
      {previewing && (
        <div className="dialog-backdrop result-preview-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setPreviewing(null);
        }}>
          <section className="form-dialog result-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="result-preview-title">
            <div className="dialog-header">
              <h2 id="result-preview-title">Result preview</h2>
              <button type="button" className="icon-button" aria-label="Close result preview" onClick={() => setPreviewing(null)}>×</button>
            </div>
            <p className="result-preview-note">
              Status: {previewing.result.resultStatus}.
            </p>
            <ResultSlip student={previewing.student} result={previewing.result} />
            <div className="dialog-actions result-preview-actions">
              <button type="button" className="admin-button button-secondary" onClick={() => setPreviewing(null)}>Close</button>
              <button type="button" className="admin-button button-primary" onClick={() => window.print()}>Print / Save as PDF</button>
            </div>
          </section>
        </div>
      )}
      {toast && (
        <div className="admin-toast" role="status">
          <span aria-hidden="true">✓</span>
          <span>{toast}</span>
          <button type="button" aria-label="Dismiss notification" onClick={() => setToast('')}>×</button>
        </div>
      )}
    </>
  );
}
