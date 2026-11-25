'use client';

import { useEffect, useState } from 'react';
import {
  loadPaymentOrders,
  manuallyGrantAccessAction,
  retryGuestCourseAccessEmailAction,
  retryOrderAdminEmailAction,
  reviewPaymentOrderAction,
  revokeGuestCourseAccessAction,
  revokeManualAccessAction,
  revokePaidCourseAccessAction,
  revokeAllCourseAccessAction,
} from '../catalogue-actions';
import { ConfirmDialog, EmptyState, PageHeading, RetryState, StatusBadge, Toast } from '../../_components/admin-ui';

function studentLabel(order, students) {
  const student = students.find((item) => item.profile_id === order.profile_id);
  if (student) return `${student.name} · ${student.student_number}`;
  if (order.buyer_email) return `Guest: ${order.buyer_name} · ${order.buyer_email}`;
  return null;
}

function entitlementStatus(entitlement) {
  if (entitlement.revoked_at) return 'revoked';
  if (entitlement.expires_at && (!Number.isFinite(Date.parse(entitlement.expires_at))
    || Date.parse(entitlement.expires_at) <= Date.now())) return 'expired';
  return 'active';
}

export default function OrdersPage() {
  const [orders, setOrders] = useState([]);
  const [courses, setCourses] = useState([]);
  const [students, setStudents] = useState([]);
  const [studentAccess, setStudentAccess] = useState([]);
  const [revocationHistory, setRevocationHistory] = useState([]);
  const [guestAccess, setGuestAccess] = useState([]);
  const [canViewStudents, setCanViewStudents] = useState(false);
  const [proofUrls, setProofUrls] = useState({});
  const [profileId, setProfileId] = useState('');
  const [courseId, setCourseId] = useState('');
  const [revoking, setRevoking] = useState(null);
  const [revocationReason, setRevocationReason] = useState('');
  const [bulkRevoking, setBulkRevoking] = useState(null);
  const [bulkCourseId, setBulkCourseId] = useState('');
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
        setStudentAccess(result.data.studentAccess);
        setRevocationHistory(result.data.revocationHistory);
        setGuestAccess(result.data.guestAccess);
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
    setBusy(order.id);
    setError('');
    const result = await reviewPaymentOrderAction(order.id, approve, '');
    if (!result.ok) setError(result.error);
    else {
      setToast(result.emailError
        ? `${approve ? 'Payment approved' : 'Payment rejected'}. ${result.emailError}`
        : (approve ? 'Payment approved and course access granted.' : 'Payment rejected; no course access was granted.'));
      await refresh();
    }
    setBusy('');
  }

  async function retryOrderEmail(order) {
    setBusy(`order-email-${order.id}`);
    const result = await retryOrderAdminEmailAction(order.id);
    await refresh();
    if (!result.ok) setError(result.error);
    else setToast('Admin order notification sent.');
    setBusy('');
  }

  async function retryGuestEmail(entitlement) {
    setBusy(`guest-email-${entitlement.id}`);
    const result = await retryGuestCourseAccessEmailAction(entitlement.id);
    await refresh();
    if (!result.ok) setError(result.error);
    else setToast('A new guest access link was emailed. The previous link is no longer valid.');
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
    if (!revoking || busy || !revocationReason.trim()) {
      if (!revocationReason.trim()) setError('Enter a reason before revoking course access.');
      return;
    }
    setBusy('revoke');
    let result;
    if (revoking.type === 'manual') {
      result = await revokeManualAccessAction(revoking.profile_id, revoking.course_id, revocationReason);
    } else if (revoking.type === 'paid') {
      result = await revokePaidCourseAccessAction(revoking.profile_id, revoking.course_id, revocationReason);
    } else {
      result = await revokeGuestCourseAccessAction(revoking.id, revocationReason);
    }
    if (!result.ok) setError(result.error);
    else {
      setToast('Course access revoked.');
      await refresh();
    }
    setBusy('');
    setRevoking(null);
    setRevocationReason('');
  }

  async function revokeBulk() {
    if (!bulkRevoking || busy || !revocationReason.trim()) return;
    setBusy('bulk-revoke');
    const result = await revokeAllCourseAccessAction(bulkRevoking, revocationReason.trim());
    if (!result.ok) setError(result.error);
    else {
      setToast(`${result.count} active course entitlement${result.count === 1 ? '' : 's'} revoked.`);
      await refresh();
    }
    setBusy('');
    setBulkRevoking(null);
    setBulkCourseId('');
    setRevocationReason('');
  }

  const manualAccess = studentAccess.filter((item) => item.grant_source === 'manual');
  const paidAccess = studentAccess.filter((item) => item.grant_source === 'approved_order');

  return (
    <>
      <PageHeading title="Orders and Payments" description="Review private receipts, approve or reject orders, and manage student and guest course access. Guest buyers do not need a student account." />
      {error && <p className="field-error" role="alert">{error}</p>}
      <section className="admin-panel">
        <div className="panel-heading"><div><h2>Revoke all access for a course</h2><p>This revokes active student, guest and manual entitlements under the selected course. Payment and entitlement history remains available.</p></div></div>
        <div className="settings-range-grid">
          <label>Course
            <select value={bulkCourseId} onChange={(event) => setBulkCourseId(event.target.value)}>
              <option value="">Select a course</option>
              {courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}
            </select>
          </label>
          <button type="button" className="admin-button button-danger" disabled={!bulkCourseId || Boolean(busy)} onClick={() => setBulkRevoking(bulkCourseId)}>Revoke all access</button>
        </div>
      </section>
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
                <td>{proofUrls[order.id] ? <a href={proofUrls[order.id]} target="_blank" rel="noreferrer">View private proof</a> : 'Receipt unavailable'}</td>
                <td>
                  <StatusBadge status={order.status} />
                  {order.decision_note && <p>{order.decision_note}</p>}
                  {order.admin_email_error && <p className="field-error">Admin email: {order.admin_email_error}</p>}
                  {order.status === 'pending' && !order.admin_email_sent_at && (
                    <button type="button" className="text-button" disabled={Boolean(busy)} onClick={() => retryOrderEmail(order)}>
                      {busy === `order-email-${order.id}` ? 'Sending…' : order.admin_email_error ? 'Retry Admin email' : 'Send Admin email'}
                    </button>
                  )}
                </td>
                <td>{order.status === 'pending' && <div className="row-actions">
                  <button type="button" className="text-button" disabled={Boolean(busy) || !proofUrls[order.id]} onClick={() => decide(order, true)}>{busy === order.id ? 'Saving…' : 'Approve'}</button>
                  <button type="button" className="text-button text-danger" disabled={Boolean(busy)} onClick={() => decide(order, false)}>Reject</button>
                </div>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <EmptyState title="No payment submissions" description="Student submissions and guest orders will appear here for review." />}
      </section>

      {!loading && !error && <section className="admin-panel">
        <div className="panel-heading"><div><h2>Student paid course access</h2><p>Each payment-approved entitlement expires seven days after approval. Revocation is retained for audit history.</p></div></div>
        {paidAccess.length ? (
          <div className="admin-table-wrap"><table className="admin-table">
            <thead><tr><th>Student</th><th>Course</th><th>Granted</th><th>Expires</th><th>State</th><th>Revocation audit</th><th>Action</th></tr></thead>
            <tbody>{paidAccess.map((item) => {
              const status = entitlementStatus(item);
              return <tr key={`${item.profile_id}-${item.course_id}`}>
                <td>{students.find((student) => student.profile_id === item.profile_id)?.name || <code>{item.profile_id}</code>}</td>
                <td>{courses.find((course) => course.id === item.course_id)?.title || item.course_id}</td>
                <td>{new Date(item.granted_at).toLocaleString()}</td>
                <td>{item.expires_at ? new Date(item.expires_at).toLocaleString() : 'No expiry'}</td>
                <td><StatusBadge status={status} /></td>
                <td>{(item.revocation_reason || item.revoked_reason) ? <><p>{item.revocation_reason || item.revoked_reason}</p><p>{item.revoked_at ? new Date(item.revoked_at).toLocaleString() : 'Time unavailable'}</p><code>{item.revoked_by || 'Actor unavailable'}</code></> : revocationHistory.filter((entry) => entry.profile_id === item.profile_id && entry.course_id === item.course_id).map((entry) => <p key={`${entry.order_id}-${entry.revoked_at}`}>{entry.revocation_reason || 'Revoked'} · {new Date(entry.revoked_at).toLocaleString()} · <code>{entry.revoked_by || 'Actor unavailable'}</code></p>)}</td>
                <td>{status === 'active' && <button type="button" className="text-button text-danger" disabled={Boolean(busy)} onClick={() => setRevoking({ ...item, type: 'paid' })}>Revoke paid access</button>}</td>
              </tr>;
            })}</tbody>
          </table></div>
        ) : <EmptyState title="No payment-approved student access" description="Approved student course entitlements will appear here." />}
      </section>}

      {!loading && !error && <section className="admin-panel">
        <div className="panel-heading"><div><h2>Guest course access</h2><p>Guest links are private bearer links. Resending rotates the token and invalidates the previous link.</p></div></div>
        {guestAccess.length ? (
          <div className="admin-table-wrap"><table className="admin-table">
            <thead><tr><th>Guest</th><th>Course</th><th>Granted</th><th>Expires</th><th>State / email</th><th>Revocation audit</th><th>Actions</th></tr></thead>
            <tbody>{guestAccess.map((item) => {
              const status = entitlementStatus(item);
              return <tr key={item.id}>
                <td>{item.buyer_email}</td>
                <td>{courses.find((course) => course.id === item.course_id)?.title || item.course_id}</td>
                <td>{new Date(item.granted_at).toLocaleString()}</td>
                <td>{new Date(item.expires_at).toLocaleString()}</td>
                <td>
                  <StatusBadge status={status} />
                  {item.access_email_error && <p className="field-error">Email: {item.access_email_error}</p>}
                  {item.access_email_sent_at && <p>Link emailed {new Date(item.access_email_sent_at).toLocaleString()}</p>}
                </td>
                <td>{(item.revocation_reason || item.revoked_reason) ? <><p>{item.revocation_reason || item.revoked_reason}</p><p>{item.revoked_at ? new Date(item.revoked_at).toLocaleString() : 'Time unavailable'}</p><code>{item.revoked_by || 'Actor unavailable'}</code></> : '—'}</td>
                <td><div className="row-actions">
                  {status === 'active' && <button type="button" className="text-button" disabled={Boolean(busy)} onClick={() => retryGuestEmail(item)}>
                    {busy === `guest-email-${item.id}` ? 'Rotating…' : 'Resend / rotate link'}
                  </button>}
                  {status === 'active' && <button type="button" className="text-button text-danger" disabled={Boolean(busy)} onClick={() => setRevoking({ ...item, type: 'guest' })}>Revoke guest access</button>}
                </div></td>
              </tr>;
            })}</tbody>
          </table></div>
        ) : <EmptyState title="No guest access grants" description="Guest access is created only after an Admin approves a guest order." />}
      </section>}

      {!loading && !error && <section className="admin-panel">
        <div className="panel-heading"><div><h2>Manual course-access grant</h2><p>For payments verified off-platform. Access is granted immediately to the selected student.</p></div></div>
        <form className="admin-form" onSubmit={grant}>
          {canViewStudents ? (
            <label>Active student
              <select required value={profileId} onChange={(event) => setProfileId(event.target.value)} disabled={!students.length}>
                <option value="">Select a student</option>
                {students.map((student) => <option key={student.profile_id} value={student.profile_id}>{student.name} · {student.student_number}</option>)}
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
        <div className="panel-heading"><div><h2>Manual course-access grants</h2><p>Keep the existing manual grant and revoke workflow separate from payment-approved access.</p></div></div>
        {manualAccess.length ? (
          <div className="admin-table-wrap"><table className="admin-table">
            <thead><tr><th>Student</th><th>Course</th><th>Granted</th><th>State</th><th>Action</th></tr></thead>
            <tbody>{manualAccess.map((item) => (
              <tr key={`${item.profile_id}-${item.course_id}`}>
                <td>{students.find((student) => student.profile_id === item.profile_id)?.name || <code>{item.profile_id}</code>}</td>
                <td>{courses.find((course) => course.id === item.course_id)?.title || item.course_id}</td>
                <td>{new Date(item.granted_at).toLocaleString()}</td>
                <td><StatusBadge status={entitlementStatus(item)} /></td>
                <td>{!item.revoked_at && <button type="button" className="text-button text-danger" disabled={Boolean(busy)} onClick={() => setRevoking({ ...item, type: 'manual' })}>Revoke manual grant</button>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <EmptyState title="No manual grants" description="Manually granted course access will appear here." />}
      </section>}

      {revoking && <ConfirmDialog
        title={`Revoke ${revoking.type === 'guest' ? 'guest' : revoking.type === 'paid' ? 'paid' : 'manual'} course access?`}
        description={<>
          <span>The learner will lose access to this course immediately. A required reason is retained in audit history.</span>
          <label className="confirm-reason">Revocation reason
            <textarea required rows={3} maxLength={500} value={revocationReason} onChange={(event) => setRevocationReason(event.target.value)} />
          </label>
        </>}
        confirmLabel={busy === 'revoke' ? 'Revoking…' : 'Revoke access'}
        onCancel={() => { if (busy !== 'revoke') setRevoking(null); }}
        onConfirm={revoke}
      />}
      {bulkRevoking && <ConfirmDialog
        title="Revoke all access for this course?"
        description={<>
          <span>All active student, guest and manual entitlements under this course will become invalid immediately. Payment and revocation history will remain.</span>
          <label className="confirm-reason">Bulk revocation reason
            <textarea required rows={3} maxLength={500} value={revocationReason} onChange={(event) => setRevocationReason(event.target.value)} />
          </label>
        </>}
        confirmLabel={busy === 'bulk-revoke' ? 'Revoking…' : 'Revoke all access'}
        onCancel={() => { if (busy !== 'bulk-revoke') { setBulkRevoking(null); setRevocationReason(''); } }}
        onConfirm={revokeBulk}
      />}
      <Toast message={toast} onDismiss={() => setToast('')} />
    </>
  );
}
