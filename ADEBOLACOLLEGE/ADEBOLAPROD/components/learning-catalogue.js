'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { createClient } from '../utils/supabase/client';
import { createGuestProofUpload, submitCourseOrder, submitGuestCourseOrder } from '../app/e-learning/actions';
import './learning-catalogue.css';

const categories = ['JSS', 'SSS Commercial', 'SSS Science', 'SSS Arts', 'Standardized Tests'];
const MAX_PROOF_SIZE = 10 * 1024 * 1024;
const proofTypes = new Set(['image/jpeg', 'image/png', 'application/pdf']);

function proofMimeType(file) {
  if (proofTypes.has(file.type)) return file.type;
  const extension = file.name.toLowerCase().split('.').pop();
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'png') return 'image/png';
  if (extension === 'pdf') return 'application/pdf';
  return '';
}

function formatPrice(value) {
  return `₦${Number(value).toLocaleString('en-NG')}`;
}

export default function LearningCatalogue({ courses, lessons, paymentSettings }) {
  const [category, setCategory] = useState('All categories');
  const [query, setQuery] = useState('');
  const [selectedCourse, setSelectedCourse] = useState('');
  const [checkoutMode, setCheckoutMode] = useState('guest');
  const [checkoutModeLoading, setCheckoutModeLoading] = useState(false);
  const [reference, setReference] = useState('');
  const [buyerName, setBuyerName] = useState('');
  const [buyerEmail, setBuyerEmail] = useState('');
  const [proof, setProof] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const bankIsConfigured = Boolean(paymentSettings?.bank_name && paymentSettings?.account_name && paymentSettings?.account_number && paymentSettings?.account_type);

  useEffect(() => {
    if (!selectedCourse) return undefined;
    let active = true;
    setCheckoutModeLoading(true);
    async function checkSession() {
      try {
        const { data, error } = await createClient().auth.getUser();
        if (!active) return;
        if (error) {
          setMessage(`Unable to check your sign-in status: ${error.message}`);
        } else {
          setCheckoutMode(data.user ? 'student' : 'guest');
        }
      } catch (error) {
        if (active) setMessage(error instanceof Error ? error.message : 'Unable to check your sign-in status.');
      } finally {
        if (active) setCheckoutModeLoading(false);
      }
    }
    checkSession();
    return () => { active = false; };
  }, [selectedCourse]);

  const filteredCourses = useMemo(() => courses.filter((course) => {
    const courseLessons = lessons.filter((lesson) => lesson.course_id === course.id);
    const matchesCategory = category === 'All categories' || course.category === category;
    const matchesQuery = `${course.title} ${course.category} ${course.description} ${courseLessons.map((lesson) => `${lesson.title} ${lesson.lesson_code || ''}`).join(' ')}`
      .toLowerCase().includes(query.trim().toLowerCase());
    return matchesCategory && matchesQuery;
  }), [category, courses, lessons, query]);

  async function submit(event) {
    event.preventDefault();
    setMessage('');
    if (!selectedCourse) {
      setMessage('Select a course.');
      return;
    }
    setBusy(true);
    let uploadedStudentProofPath = '';
    try {
      const supabase = createClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw new Error(`Unable to verify the current session: ${authError.message}`);

      if (checkoutMode === 'guest') {
        if (!proof) throw new Error('Attach a payment receipt to submit a guest order.');
        const mimeType = proofMimeType(proof);
        if (!mimeType || proof.size > MAX_PROOF_SIZE || proof.size < 1) {
          throw new Error('Payment proof must be JPEG, PNG, or PDF and no larger than 10 MB.');
        }
        const upload = await createGuestProofUpload(proof.name, mimeType, proof.size);
        if (!upload.ok) throw new Error(upload.error);
        const { error: uploadError } = await supabase.storage.from('course-payment-proofs')
          .uploadToSignedUrl(upload.path, upload.token, proof, { contentType: mimeType });
        if (uploadError) throw new Error(uploadError.message);
        const result = await submitGuestCourseOrder(
          selectedCourse,
          buyerName.trim(),
          buyerEmail.trim(),
          reference.trim(),
          upload.path,
        );
        if (!result.ok) throw new Error(result.error);
        setMessage(result.notificationError
          ? `Guest order submitted for review. Admin email notification: ${result.notificationError}`
          : 'Guest order and receipt submitted for Admin review. Course access is provided by email only after payment approval.');
        setReference('');
        setBuyerName('');
        setBuyerEmail('');
        setProof(null);
        event.target.reset();
        return;
      }

      if (!user) throw new Error('Sign in with an active student account, or choose guest checkout.');
      if (!proof) throw new Error('Attach payment proof to submit as a student.');
      const mimeType = proofMimeType(proof);
      if (!mimeType || proof.size > MAX_PROOF_SIZE || proof.size < 1) {
        throw new Error('Payment proof must be JPEG, PNG, or PDF and no larger than 10 MB.');
      }

      const fileName = proof.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-150);
      const path = `${user.id}/${crypto.randomUUID()}-${fileName}`;
      const { error: uploadError } = await supabase.storage.from('course-payment-proofs').upload(path, proof, {
        contentType: mimeType,
        upsert: false,
      });
      if (uploadError) throw uploadError;
      uploadedStudentProofPath = path;
      const result = await submitCourseOrder(selectedCourse, reference.trim(), path);
      if (!result.ok) throw new Error(result.error);
      uploadedStudentProofPath = '';
      setMessage(result.notificationError
        ? `Payment proof submitted for Admin review. Admin email notification: ${result.notificationError}`
        : 'Payment proof submitted for Admin review. Access is not granted until an Admin approves the payment.');
      setReference('');
      setProof(null);
      event.target.reset();
    } catch (error) {
      if (uploadedStudentProofPath) {
        const { error: cleanupError } = await createClient().storage.from('course-payment-proofs')
          .remove([uploadedStudentProofPath]);
        if (cleanupError) {
          setMessage(`${error instanceof Error ? error.message : 'Unable to submit the course order.'} The uploaded receipt could not be removed: ${cleanupError.message}`);
        } else {
          setMessage(error instanceof Error ? error.message : 'Unable to submit the course order.');
        }
      } else {
        setMessage(error instanceof Error ? error.message : 'Unable to submit the course order.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container learning-catalogue">
      {bankIsConfigured ? (
        <aside className="catalogue-availability">
          <div><strong>Manual bank transfer</strong>
            <p>{paymentSettings.bank_name} · {paymentSettings.account_name} · {paymentSettings.account_number} · {paymentSettings.account_type}</p>
          </div>
          <p>Access is granted only after an Admin verifies and approves your payment.</p>
        </aside>
      ) : (
        <aside className="catalogue-availability">
          <div><strong>Course catalogue</strong><p>Contact the College for bank-transfer instructions.</p></div>
        </aside>
      )}

      <div className="section-header section-heading-row learning-catalogue-heading">
        <div><span className="eyebrow">Learning categories</span><h2>Available courses</h2></div>
        <p>Lesson files are private and require an approved course-access grant.</p>
      </div>

      <div className="catalogue-toolbar">
        <label className="catalogue-search">
          <span aria-hidden="true">⌕</span><span className="sr-only">Search courses and lessons</span>
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search courses or lessons" />
        </label>
        <div className="catalogue-category-filters" role="group" aria-label="Filter by category">
          {['All categories', ...categories].map((item) => (
            <button type="button" key={item} aria-pressed={category === item} className={category === item ? 'is-selected' : ''} onClick={() => setCategory(item)}>{item}</button>
          ))}
        </div>
      </div>

      {filteredCourses.length ? (
        <div className="catalogue-demo-grid">
          {filteredCourses.map((course) => {
            const courseLessons = lessons.filter((lesson) => lesson.course_id === course.id);
            return (
              <article className="catalogue-demo-card" key={course.id}>
                <div className="catalogue-demo-card-top"><span>{course.category}</span><span>Course</span></div>
                <h3>{course.title}</h3>
                {course.description && <p>{course.description}</p>}
                <dl>
                  <div><dt>Course price</dt><dd>{formatPrice(course.price)}</dd></div>
                  <div><dt>Published lessons</dt><dd>{courseLessons.length}</dd></div>
                </dl>
                {courseLessons.length > 0 && <ul className="catalogue-lesson-list">
                  {courseLessons.map((lesson) => <li key={lesson.id}>
                    {lesson.lesson_code ? <code>{lesson.lesson_code}</code> : null}
                    <Link href={`/e-learning/${lesson.id}`}>{lesson.title}</Link>
                    {lesson.duration_minutes && <span className="catalogue-lesson-duration">{lesson.duration_minutes} min</span>}
                    {lesson.description && (
                      <details className="catalogue-lesson-details">
                        <summary>Lesson information</summary>
                        <p>{lesson.description}</p>
                      </details>
                    )}
                  </li>)}
                </ul>}
                <button className="btn btn-outline catalogue-open-button" type="button" disabled={!bankIsConfigured} onClick={() => { setSelectedCourse(course.id); setMessage(''); setProof(null); }}>
                  Buy Now
                </button>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="catalogue-empty" role="status">
          <h3>{courses.length ? 'No matching courses' : 'No courses available'}</h3>
          <p>{courses.length
            ? 'Try another category or search term.'
            : 'Published courses will appear here when the College adds them.'}</p>
        </div>
      )}

      {selectedCourse && bankIsConfigured && (
        <div className="catalogue-order-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setSelectedCourse(''); }}>
          <section className="catalogue-order-dialog" role="dialog" aria-modal="true" aria-labelledby="course-order-title">
            <button className="icon-button" type="button" aria-label="Close" disabled={busy} onClick={() => setSelectedCourse('')}>×</button>
            <h2 id="course-order-title">Submit bank-transfer payment</h2>
            <p>Transfer {formatPrice(courses.find((item) => item.id === selectedCourse)?.price || 0)} to {paymentSettings.bank_name}, account name {paymentSettings.account_name}, account number {paymentSettings.account_number} ({paymentSettings.account_type}). No order grants course access until an Admin verifies the payment and approves it.</p>
            <form className="admin-form" onSubmit={submit}>
              <fieldset className="checkout-mode-options">
                <legend>Checkout type</legend>
                <label><input type="radio" name="checkout-mode" value="guest" checked={checkoutMode === 'guest'} onChange={() => setCheckoutMode('guest')} /> Guest checkout</label>
                <label><input type="radio" name="checkout-mode" value="student" checked={checkoutMode === 'student'} onChange={() => setCheckoutMode('student')} /> Signed-in student</label>
              </fieldset>
              {checkoutMode === 'guest' ? (
                <>
                  <label>Your name
                    <input required maxLength={100} value={buyerName} onChange={(event) => setBuyerName(event.target.value)} />
                  </label>
                  <label>Email for course access
                    <input required type="email" autoComplete="email" maxLength={254} value={buyerEmail} onChange={(event) => setBuyerEmail(event.target.value)} />
                  </label>
                </>
              ) : <p className="field-hint">Student checkout requires an active student sign-in. <Link href="/student/login">Sign in</Link>.</p>}
              <label>Proof of transfer (JPEG, PNG, or PDF; max 10 MB)
                <input required type="file" accept="image/jpeg,image/png,application/pdf,.jpg,.jpeg,.png,.pdf" onChange={(event) => setProof(event.target.files?.[0] || null)} />
              </label>
              {proof && <p className="field-hint">Selected: {proof.name} · {(proof.size / (1024 * 1024)).toFixed(1)} MB</p>}
              <label>Payment reference
                <input required maxLength={120} value={reference} onChange={(event) => setReference(event.target.value)} />
              </label>
              {message && <p className="field-error" role="status">{message}</p>}
              {checkoutModeLoading && <p className="field-hint" role="status">Checking sign-in status…</p>}
              <p className="field-hint">{checkoutMode === 'guest'
                ? 'Your receipt is uploaded to private storage. An Admin must verify the transfer before a seven-day course-access link is emailed to you.'
                : 'Payment proof remains private. Access is granted for seven days after Admin approval.'}</p>
              <div className="dialog-actions">
                <button type="submit" className="admin-button button-primary" disabled={busy || checkoutModeLoading}>{busy ? 'Submitting…' : 'Submit for review'}</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
