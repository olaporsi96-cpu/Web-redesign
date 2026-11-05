'use client';

import { useState } from 'react';
import { FormDialog } from './admin-ui';
import supabaseError from '../../../utils/supabase-error.cjs';

const { formatSupabaseError } = supabaseError;

const emptySubject = () => ({
  id: `new-subject-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  name: '',
  score: '',
  grade: '',
  remark: '',
});

function createBlankResult(studentId) {
  return {
    id: '',
    studentId,
    examinationNumber: '',
    candidateNumber: '',
    school: 'Adebola College',
    examYear: '',
    resultStatus: 'Draft',
    subjects: [emptySubject()],
  };
}

export default function ResultForm({ result, students, onSave, onClose }) {
  const [form, setForm] = useState(result || createBlankResult(students[0]?.id || ''));
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  function updateSubject(id, field, value) {
    setForm((current) => ({
      ...current,
      subjects: current.subjects.map((subject) => subject.id === id
        ? { ...subject, [field]: value }
        : subject),
    }));
  }

  async function submit(event) {
    event.preventDefault();
    setIsSaving(true);
    setError('');
    try {
      const response = await onSave({
        ...form,
        subjects: form.subjects.map((subject) => ({
          ...subject,
          name: subject.name.trim(),
          score: subject.score.trim(),
          grade: subject.grade.trim(),
          remark: subject.remark.trim(),
        })),
      });
      if (!response.ok) {
        setError(response.error || 'The result could not be saved. Check authorization and required database objects.');
        return;
      }
      onClose();
    } catch (saveError) {
      setError(formatSupabaseError(saveError, 'Saving the result'));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <FormDialog title={result ? 'Edit result' : 'Create result'} onClose={onClose}>
      <form className="admin-form result-admin-form" onSubmit={submit}>
        <p className="admin-form-note">
          Scores, grades, and remarks are entered as supplied; this form applies no grading or result-calculation rules.
        </p>
        <label>
          Student account
          <select
            required
            value={form.studentId}
            onChange={(event) => setForm((current) => ({ ...current, studentId: event.target.value }))}
          >
            {students.map((student) => (
              <option key={student.id} value={student.id}>{student.name} · {student.studentNumber}</option>
            ))}
          </select>
        </label>
        <div className="result-admin-fields">
          <label>
            Examination number
            <input required maxLength={60} value={form.examinationNumber} onChange={(event) => setForm({ ...form, examinationNumber: event.target.value })} />
          </label>
          <label>
            Candidate number
            <input required maxLength={60} value={form.candidateNumber} onChange={(event) => setForm({ ...form, candidateNumber: event.target.value })} />
          </label>
          <label>
            School
            <input required maxLength={100} value={form.school} onChange={(event) => setForm({ ...form, school: event.target.value })} />
          </label>
          <label>
            Exam year
            <input required maxLength={30} value={form.examYear} onChange={(event) => setForm({ ...form, examYear: event.target.value })} placeholder="e.g. 2025/2026" />
          </label>
        </div>
        <label>
          Workflow status
          <input value={form.resultStatus} readOnly />
          <span className="field-hint">Use the result list actions to submit, release, or return this record to draft.</span>
        </label>

        <div className="result-subject-editor">
          <div className="result-subject-editor-heading">
            <h3>Subjects and entered values</h3>
            <button type="button" className="admin-button button-secondary" onClick={() => setForm((current) => ({
              ...current,
              subjects: [...current.subjects, emptySubject()],
            }))}>
              Add subject
            </button>
          </div>
          {form.subjects.map((subject, index) => (
            <fieldset className="result-subject-fields" key={subject.id}>
              <legend>Subject {index + 1}</legend>
              <label>
                Subject
                <input required maxLength={80} value={subject.name} onChange={(event) => updateSubject(subject.id, 'name', event.target.value)} />
              </label>
              <label>
                Score (entered as supplied)
                <input maxLength={30} value={subject.score} onChange={(event) => updateSubject(subject.id, 'score', event.target.value)} placeholder="e.g. 72%" />
              </label>
              <label>
                Grade (entered as supplied)
                <input maxLength={20} value={subject.grade} onChange={(event) => updateSubject(subject.id, 'grade', event.target.value)} />
              </label>
              <label>
                Remark (entered as supplied)
                <input maxLength={80} value={subject.remark} onChange={(event) => updateSubject(subject.id, 'remark', event.target.value)} />
              </label>
              <button
                type="button"
                className="text-button text-danger"
                disabled={form.subjects.length === 1}
                onClick={() => setForm((current) => ({
                  ...current,
                  subjects: current.subjects.filter((item) => item.id !== subject.id),
                }))}
                aria-label={`Remove subject ${index + 1}`}
              >
                Remove subject
              </button>
            </fieldset>
          ))}
        </div>
        {error && <p className="field-error" role="alert">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="admin-button button-secondary" onClick={onClose} disabled={isSaving}>Cancel</button>
          <button type="submit" className="admin-button button-primary" disabled={isSaving || !students.length}>
            {isSaving ? 'Saving…' : result ? 'Save changes' : 'Create result'}
          </button>
        </div>
      </form>
    </FormDialog>
  );
}
