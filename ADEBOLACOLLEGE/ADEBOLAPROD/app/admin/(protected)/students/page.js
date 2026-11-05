'use client';

import { useEffect, useMemo, useState } from 'react';
import { ConfirmDialog, EmptyState, FormDialog, PageHeading, RetryState } from '../../_components/admin-ui';
import {
  inviteStudent,
  listStudents,
  sendStudentAccessEmail,
  setStudentActive,
  updateStudentRecord,
} from './actions';

function StudentForm({ student, onSave, onClose }) {
  const [name, setName] = useState(student?.name || '');
  const [studentNumber, setStudentNumber] = useState(student?.student_number || '');
  const [email, setEmail] = useState(student?.email || '');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);
  const [invitationNeedsReview, setInvitationNeedsReview] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setIsSaving(true);
    try {
      const response = await onSave({
        id: student?.id,
        name,
        studentNumber,
        email,
      });
      if (!response.ok) {
        setError(response.error);
        setRateLimited(Boolean(response.rateLimited || response.invitationCreated));
        setInvitationNeedsReview(Boolean(response.invitationCreated));
        return;
      }
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save the student record.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <FormDialog title={student ? 'Edit student record' : 'Invite student'} onClose={onClose}>
      <form className="admin-form" onSubmit={submit}>
        <p className="admin-form-note">
          {student
            ? 'Name and student number changes are saved to the student record. The sign-in email cannot be changed here.'
            : 'A sign-in invitation will be sent to this email address. No student record is created until the invitation and record save succeed.'}
        </p>
        {!student && (
          <p className="admin-form-note">
            TEST email delivery is limited to 2 emails per hour and SMTP is disabled. Normal school delivery requires a verified sending domain and configured SMTP provider. A failed send is not treated as an invitation.
          </p>
        )}
        <label>Name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={100} required disabled={rateLimited} /></label>
        <label>Student number<input value={studentNumber} onChange={(event) => setStudentNumber(event.target.value)} maxLength={50} required disabled={rateLimited} /></label>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            maxLength={254}
            required
            readOnly={Boolean(student)}
            disabled={rateLimited}
          />
        </label>
        {error && <p className="admin-auth-error" role="alert">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="admin-button button-secondary" onClick={onClose} disabled={isSaving}>Cancel</button>
          <button type="submit" className="admin-button button-primary" disabled={isSaving || rateLimited}>
            {isSaving
              ? 'Saving…'
              : invitationNeedsReview
                ? 'Do not retry—review account'
                : rateLimited
                  ? 'Wait before retrying'
                  : student
                    ? 'Save changes'
                    : 'Send invitation'}
          </button>
        </div>
      </form>
    </FormDialog>
  );
}

export default function AdminStudentsPage() {
  const [students, setStudents] = useState([]);
  const [canManage, setCanManage] = useState(false);
  const [canViewResults, setCanViewResults] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [view, setView] = useState('active');
  const [editing, setEditing] = useState(undefined);
  const [confirming, setConfirming] = useState(null);
  const [emailingId, setEmailingId] = useState(null);
  const [blockedEmailIds, setBlockedEmailIds] = useState(() => new Set());
  const [toast, setToast] = useState('');

  async function loadStudents() {
    setIsLoading(true);
    setLoadError('');
    try {
      const response = await listStudents();
      if (!response.ok) throw new Error(response.error);
      setStudents(response.students);
      setCanManage(response.canManage);
      setCanViewResults(response.canViewResults);
    } catch (error) {
      setStudents([]);
      setLoadError(error instanceof Error ? error.message : 'Unable to load students.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadStudents();
  }, []);

  const filteredStudents = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return students
      .filter((student) => student.is_active === (view === 'active'))
      .filter((student) => (
        !needle
        || [student.name, student.student_number, student.email]
          .some((value) => value.toLowerCase().includes(needle))
      ));
  }, [students, query, view]);

  async function saveRecord(student) {
    const response = editing
      ? await updateStudentRecord({ id: editing.id, ...student })
      : await inviteStudent(student);
    if (response.ok) {
      setToast(editing ? 'Student record saved.' : 'Student invitation sent.');
      await loadStudents();
    }
    return response;
  }

  async function toggleActive(student) {
    const response = await setStudentActive(student.id, !student.is_active);
    if (!response.ok) {
      setToast(response.error);
      return;
    }
    setToast(student.is_active
      ? 'Student archived. The account and historical records were preserved.'
      : 'Student restored. Sign-in is available again.');
    await loadStudents();
  }

  async function sendAccessEmail(student) {
    setEmailingId(student.id);
    try {
      const response = await sendStudentAccessEmail(student.id);
      setToast(response.ok ? 'Password-recovery email sent.' : response.error);
      if (response.rateLimited || response.unavailable) {
        setBlockedEmailIds((current) => new Set(current).add(student.id));
      }
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Unable to send the account email.');
    } finally {
      setEmailingId(null);
    }
  }

  return (
    <>
      <div className="page-heading-row">
        <PageHeading title="Students" description="Manage student accounts and student records." />
        {canManage && (
          <button type="button" className="admin-button button-primary" onClick={() => setEditing(null)}>
            ＋ Invite student
          </button>
        )}
      </div>
      <section className="admin-panel student-management-panel">
        <div className="panel-heading student-search-heading">
          <div>
            <h2>Student records <span className="record-count">
              {isLoading ? 'Loading…' : loadError ? 'Unavailable' : filteredStudents.length}
            </span></h2>
          </div>
          <div className="student-list-controls">
            <div className="student-view-tabs" role="group" aria-label="Student record status">
              <button type="button" className={view === 'active' ? 'is-selected' : ''} aria-pressed={view === 'active'} onClick={() => setView('active')}>
                Active ({students.filter((student) => student.is_active).length})
              </button>
              <button type="button" className={view === 'archived' ? 'is-selected' : ''} aria-pressed={view === 'archived'} onClick={() => setView('archived')}>
                Archived ({students.filter((student) => !student.is_active).length})
              </button>
            </div>
            <label className="admin-search">
              <span className="sr-only">Search students</span>
              <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, number, or email" />
            </label>
          </div>
        </div>
        {isLoading ? (
          <div className="admin-empty-inline" role="status">Loading student records…</div>
        ) : loadError ? (
          <RetryState message={loadError} onRetry={loadStudents} loading={isLoading} />
        ) : filteredStudents.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Student number</th>
                  <th>Email</th>
                  {canViewResults && <th>Released results</th>}
                  <th>Status</th>
                  {canManage && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((student) => (
                  <tr key={student.id}>
                    <td><strong>{student.name}</strong></td>
                    <td>{student.student_number}</td>
                    <td>{student.email}</td>
                    {canViewResults && <td>{student.releasedResults}</td>}
                    <td><span className={`student-record-status${student.is_active ? ' is-active' : ''}`}>{student.is_active ? 'Active' : 'Archived'}</span></td>
                    {canManage && (
                      <td>
                        <div className="row-actions">
                          <button type="button" className="text-button" onClick={() => setEditing(student)}>Edit</button>
                          <button
                            type="button"
                            className="text-button"
                            onClick={() => sendAccessEmail(student)}
                            disabled={emailingId === student.id || blockedEmailIds.has(student.id)}
                          >
                            {emailingId === student.id ? 'Checking…' : blockedEmailIds.has(student.id) ? 'Email unavailable' : 'Access email'}
                          </button>
                          <button type="button" className="text-button" onClick={() => setConfirming(student)}>
                            {student.is_active ? 'Archive' : 'Restore'}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title={query
              ? 'No matching students'
              : view === 'archived'
                ? 'No archived students'
                : 'No active student records'}
            description={query
              ? 'Try another name, student number, or email.'
              : view === 'archived'
                ? 'Students archived by the school will appear here and can be restored without creating a duplicate record.'
                : canManage
                ? 'Invite a student to create the first student record.'
                : 'No records have been added yet.'}
            action={!query && view === 'active' && canManage
              ? <button type="button" className="admin-button button-primary" onClick={() => setEditing(null)}>Invite student</button>
              : null}
          />
        )}
      </section>
      {editing !== undefined && (
        <StudentForm
          key={editing?.id || 'new-student'}
          student={editing}
          onSave={saveRecord}
          onClose={() => setEditing(undefined)}
        />
      )}
      {confirming && (
        <ConfirmDialog
          title={confirming.is_active ? 'Archive this student?' : 'Restore this student?'}
          description={confirming.is_active
            ? `${confirming.name} will be unable to sign in. The profile, Auth account, student number, results, payments, enrolments, and other history will be preserved.`
            : `${confirming.name} will regain access through the existing account. No duplicate record will be created.`}
          confirmLabel={confirming.is_active ? 'Archive student' : 'Restore student'}
          onCancel={() => setConfirming(null)}
          onConfirm={async () => {
            await toggleActive(confirming);
            setConfirming(null);
          }}
        />
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
