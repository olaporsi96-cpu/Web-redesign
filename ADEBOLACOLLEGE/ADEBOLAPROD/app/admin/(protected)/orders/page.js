'use client';

import { useEffect, useState } from 'react';
import { EmptyState, PageHeading, RetryState, StatusBadge, Toast } from '../../_components/admin-ui';
import { loadPaymentOrders, manuallyGrantAccessAction, reviewPaymentOrderAction, revokeManualAccessAction } from '../catalogue-actions';

function studentLabel(order, students) {
  const student = students.find((item) => item.profile_id === order.profile_id);
  if (student) return `${student.name} · ${student.student_number}`;
  if (order.buyer_email) return `Guest: ${order.buyer_name} · ${order.buyer_email}`;
  return null;
}

export default function OrdersPage() {
  const [orders, setOrders] = useState([]);
  const [courses, setCourses] = useState([]);
  const [students, setStudents] = useState([]);
  const [manualAccess, setManualAccess] = useState([]);
  const [canViewStudents, setCanViewStudents] = useState(false);
  const [proofUrls, setProofUrls] = useState({});
  const [linkedProfiles, setLinkedProfiles] = useState({});
  const [profileId, setProfileId] = useState('');
  const [courseId, setCourseId] = useState('');
  const [revoking, setRevoking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  async function refresh() {
    setLoading(true);
    setError('');
    try {
      const result = await loadPaymentOrders();
      if (!result.ok) setError(result.error);
      else {
        setOrders(result.data.orders);
        setCourses(result.data.courses);
        setStudents(result.data.students);
        setManualAccess(result.data.manualAccess);
        setCanViewStudents(result.data.canViewStudents);
        setProofUrls(result.data.proofUrls);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load payment submissions.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { refresh(); }, []);

  async function decide(order, approve) {
    const linkedProfileId = order.profile_id ? null : linkedProfiles[order.id] || null;
    if (approve && !order.profile_id && !linkedProfileId) {
      setError('Select the active student account matching this guest order email before approval.');
      return;
    }
    setBusy(order.id);
    const result = await reviewPaymentOrderAction(order.id, approve, '', linkedProfileId);
    if (!result.ok) setError(result.error);
    else { setToast(approve ? 'Payment approved and course access granted.' : 'Payment rejected; no course access was granted.'); await refresh(); }
    setBusy('');
  }

  async function grant(event) {
    event.preventDefault();
    setBusy('manual');
    const result = await manuallyGrantAccessAction(profileId.trim(), courseId);
    if (!result.ok) setError(result.error);
    else {
      setToast('Course access manually granted.');
      setProfileId('');
      await refresh();
    }
    setBusy('');
  }

  async function revoke() {
    if (!revoking || busy) return;
    setBusy('revoke');
    const result = await revokeManualAccessAction(revoking.profile_id, revoking.course_id);
    if (!result.ok) setError(result.error);
    else {
      setToast('Manual course access revoked.');
      setManualAccess(manualAccess.filter((item) => item.profile_id !== revoking.profile_id
        || item.course_id !== revoking.course_id));
    }
    setBusy('');
    setRevoking(null);
  }

  return (
    <>
      <PageHeading title="Orders and Payments" description="Review student submissions and guest orders. Verify transfers; guest orders must be linked to an active student account matching the submitted email before approval." />
      <section className="admin-panel">
        <div className="panel-heading"><div><h2>Payment submissions</h2><p>Approve only after verifying the transfer. Rejected and pending orders have no access grant.</p></div></div>
        {loading ? <p className="admin-empty-inline" role="status">Loading payment submissions…</p> : error ? (
          <RetryState message={error} onRetry={refresh} loading={loading} />
        ) : orders.length ? (
          <div className="admin-table-wrap"><table className="admin-table">
            <thead><tr><th>Submitted</th><th>Student / guest</th><th>Course</th><th>Amount</th><th>Reference</th><th>Proof</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>{orders.map((order) => (
              <tr key={order.id}>
                <td>{new Date(order.created_at).toLocaleString()}</td>
                <td>{studentLabel(order, students) || <code>{order.profile_id}</code>}</td>
                <td>{courses.find((course) => course.id === order.course_id)?.title || order.course_id}</td>
                <td>₦{Number(order.amount).toLocaleString('en-NG')}</td>
                <td>{order.payment_reference}</td>
                <td>{proofUrls[order.id] ? <a href={proofUrls[order.id]} target="_blank" rel="noreferrer">View private proof</a> : order.proof_path ? 'Unavailable' : 'Not submitted by guest'}</td>
                <td><StatusBadge status={order.status} />{order.decision_note && <p>{order.decision_note}</p>}</td>
                <td>{order.status === 'pending' && <div className="row-actions">
                  {!order.profile_id && (canViewStudents ? (
                    <label className="order-link-student">Link matching student
                      <select value={linkedProfiles[order.id] || ''} onChange={(event) => setLinkedProfiles({ ...linkedProfiles, [order.id]: event.target.value })}>
                        <option value="">Select matching email</option>
                        {students.filter((student) => student.email?.toLowerCase() === order.buyer_email?.toLowerCase()).map((student) => (
                          <option key={student.profile_id} value={student.profile_id}>{student.name} · {student.student_number}</option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <label className="order-link-student">Matching student profile ID
                      <input value={linkedProfiles[order.id] || ''} onChange={(event) => setLinkedProfiles({ ...linkedProfiles, [order.id]: event.target.value })} />
                    </label>
                  ))}
                  <button type="button" className="text-button" disabled={Boolean(busy) || (!order.profile_id && !linkedProfiles[order.id])} onClick={() => decide(order, true)}>{busy === order.id ? 'Saving…' : 'Approve'}</button>
                  <button type="button" className="text-button text-danger" disabled={Boolean(busy)} onClick={() => decide(order, false)}>Reject</button>
                </div>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <EmptyState title="No payment submissions" description="Student submissions and guest orders will appear here for review." />}
      </section>
      {!loading && !error && <section className="admin-panel">
        <div className="panel-heading"><div><h2>Manual course-access grant</h2><p>For payments verified off-platform. Access is granted immediately to the selected student.</p></div></div>
        <form className="admin-form" onSubmit={grant}>
          {canViewStudents ? (
            <label>Active student
              <select required value={profileId} onChange={(event) => setProfileId(event.target.value)} disabled={!students.length}>
                <option value="">Select a student</option>
                {students.map((student) => (
                  <option key={student.profile_id} value={student.profile_id}>
                    {student.name} · {student.student_number}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label>Student profile UUID<input required value={profileId} onChange={(event) => setProfileId(event.target.value)} placeholder="Supabase profile ID" /></label>
          )}
          <label>Course<select required value={courseId} onChange={(event) => setCourseId(event.target.value)}><option value="">Select a course</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}</select></label>
          <button type="submit" className="admin-button button-primary" disabled={Boolean(busy) || !courses.length || (canViewStudents && !students.length)}>{busy === 'manual' ? 'Granting…' : 'Grant access'}</button>
        </form>
      </section>}
      {!loading && !error && <section className="admin-panel">
        <div className="panel-heading"><div><h2>Manual course-access grants</h2><p>Only manual grants can be revoked here. Payment-approved access remains tied to its approved order.</p></div></div>
        {manualAccess.length ? (
          <div className="admin-table-wrap"><table className="admin-table">
            <thead><tr><th>Student</th><th>Course</th><th>Granted</th><th>Action</th></tr></thead>
            <tbody>{manualAccess.map((item) => (
              <tr key={`${item.profile_id}-${item.course_id}`}>
                <td>{students.find((student) => student.profile_id === item.profile_id)?.name || <code>{item.profile_id}</code>}</td>
                <td>{courses.find((course) => course.id === item.course_id)?.title || item.course_id}</td>
                <td>{new Date(item.granted_at).toLocaleString()}</td>
                <td><button type="button" className="text-button text-danger" disabled={Boolean(busy)} onClick={() => setRevoking(item)}>Revoke manual grant</button></td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <EmptyState title="No manual grants" description="Manually granted course access will appear here." />}
      </section>}
      {revoking && <ConfirmDialog
        title="Revoke manual course access?"
        description="The student will lose access to this course. Payment-approved access cannot be revoked from this action."
        confirmLabel={busy === 'revoke' ? 'Revoking…' : 'Revoke access'}
        onCancel={() => { if (busy !== 'revoke') setRevoking(null); }}
        onConfirm={revoke}
      />}
      <Toast message={toast} onDismiss={() => setToast('')} />
    </>
  );
}
