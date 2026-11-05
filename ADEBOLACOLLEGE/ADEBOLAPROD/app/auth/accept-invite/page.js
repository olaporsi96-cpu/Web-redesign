'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { checkInviteSession, setInvitedAccountPassword } from './actions';
import inviteLinkError from '../../../utils/invite-link-error.cjs';

const signInRoutes = new Set(['/student/login', '/admin/login/sub-admin']);
const { invitationLinkErrorMessage } = inviteLinkError;

export default function AcceptInvitePage() {
  const [next, setNext] = useState('');
  const [status, setStatus] = useState('checking');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams(window.location.search);
    const requestedNext = params.get('next');
    const route = signInRoutes.has(requestedNext) ? requestedNext : '';
    const linkError = invitationLinkErrorMessage(params.get('error'));

    setNext(route);
    if (linkError || !route) {
      setError(linkError || 'This invitation link has an invalid destination.');
      setStatus('invalid');
      return () => { active = false; };
    }

    checkInviteSession(route).then((result) => {
      if (!active) return;
      if (!result.ok) {
        setError(result.error);
        setStatus('invalid');
      } else {
        setStatus('ready');
      }
    }).catch((sessionError) => {
      if (!active) return;
      setError(sessionError instanceof Error ? sessionError.message : 'Unable to verify this invitation session.');
      setStatus('invalid');
    });

    return () => { active = false; };
  }, []);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setNotice('');
    if (password.length < 8) {
      setError('Use a password with at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('The passwords do not match.');
      return;
    }

    setIsSaving(true);
    try {
      const result = await setInvitedAccountPassword(password, next);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPassword('');
      setConfirmPassword('');
      setNotice(result.warning || '');
      setStatus('complete');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to set your password.');
    } finally {
      setIsSaving(false);
    }
  }

  const accountLabel = next === '/student/login' ? 'STUDENT ACCOUNT' : 'SUB-ADMIN ACCOUNT';
  const accountName = next === '/student/login' ? 'Student' : 'Sub-Admin';

  return (
    <div className="admin-access-page">
      <section className="admin-auth-card">
        <Image src="/images/NewPics/Pix25-SchoolLogo.jpg" alt="Adebola College crest" width={90} height={92} />
        <span className="admin-auth-label">ACCOUNT INVITATION</span>
        <h1>{status === 'complete' ? 'Account activated' : 'Set your password'}</h1>
        {status === 'checking' && <p role="status">Verifying your invitation…</p>}
        {status === 'ready' && (
          <>
            <p>Choose a password for your {accountName} account. You will be asked to sign in after activation.</p>
            <form className="admin-auth-form" onSubmit={submit}>
              <label>
                New password
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
              <label>
                Confirm password
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
              </label>
              {error && <p className="admin-auth-error" role="alert">{error}</p>}
              <button className="admin-button button-primary" type="submit" disabled={isSaving}>
                {isSaving ? 'Activating…' : 'Set password'}
              </button>
            </form>
          </>
        )}
        {status === 'invalid' && (
          <div className="admin-auth-state is-error" role="alert">
            <strong>Invitation could not be verified</strong>
            <p>{error}</p>
          </div>
        )}
        {status === 'complete' && (
          <div className="admin-auth-state" role="status">
            <strong>Your password has been set.</strong>
            <p>{notice || `Your ${accountName} account is ready. Sign in with your email and new password.`}</p>
          </div>
        )}
        {status === 'ready' && (
          <p className="admin-auth-note">Your account role and assigned permissions are not changed by password setup.</p>
        )}
        {signInRoutes.has(next) && (
          <Link className="admin-auth-link" href={next}>
            {status === 'complete' ? `Continue to ${accountLabel === 'STUDENT ACCOUNT' ? 'student' : 'Sub-Admin'} sign in` : 'Return to sign in'}
          </Link>
        )}
      </section>
    </div>
  );
}
