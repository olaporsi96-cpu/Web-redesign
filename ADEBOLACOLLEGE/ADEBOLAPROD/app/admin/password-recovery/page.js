'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createClient } from '../../../utils/supabase/client';

export default function PasswordRecoveryPage() {
  const [state, setState] = useState('request');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    const queryParams = new URLSearchParams(window.location.search);
    const hasRecoveryError = hashParams.has('error') || queryParams.has('error');
    const recoveryLink = hashParams.get('type') === 'recovery';
    if (hasRecoveryError) {
      setState('invalid');
      setError(hashParams.get('error_description') || queryParams.get('error_description') || '');
    } else if (recoveryLink) {
      setState('reset');
    }

    try {
      const supabase = createClient();
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
        if (event === 'PASSWORD_RECOVERY') setState('reset');
      });

      return () => subscription.unsubscribe();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Supabase authentication is not configured.');
    }
  }, []);

  async function requestReset(event) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      const supabase = createClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/admin/password-recovery`,
      });
      if (resetError) {
        setError(resetError.message);
        return;
      }
      setState('requested');
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : 'Unable to request a password reset.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function updatePassword(event) {
    event.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Use a password with at least 8 characters.');
      return;
    }
    if (password !== confirmation) {
      setError('The passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message);
        return;
      }

      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) {
        setError(`Your password was updated, but sign-out failed: ${signOutError.message}`);
        return;
      }

      setPassword('');
      setConfirmation('');
      setState('updated');
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Unable to update the password.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="admin-access-page">
      <section className="admin-auth-card">
        <Image src="/images/NewPics/Pix25-SchoolLogo.jpg" alt="Adebola College crest" width={90} height={92} />
        <span className="admin-auth-label">ACCOUNT SECURITY</span>
        <h1>Password recovery</h1>
        <p>Request a verified password-reset email or complete a reset from a valid Supabase recovery link.</p>

        {state === 'request' && (
          <form className="admin-auth-form" onSubmit={requestReset}>
            <label>
              Account email
              <input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            {error && <p className="admin-auth-error" role="alert">{error}</p>}
            <button className="admin-button button-primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
        )}

        {state === 'requested' && (
          <div className="admin-auth-state" role="status">
            <strong>Check your email</strong>
            <p>If an account matches that address, Supabase will send a password-reset link.</p>
          </div>
        )}

        {state === 'invalid' && (
          <div className="admin-auth-state is-error" role="alert">
            <strong>Reset link invalid or expired</strong>
            <p>{error || 'Request a new reset link and open it on this device to continue.'}</p>
          </div>
        )}

        {state === 'reset' && (
          <form className="admin-auth-form" onSubmit={updatePassword}>
            <label>
              New password
              <input type="password" autoComplete="new-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
            </label>
            <label>
              Confirm new password
              <input type="password" autoComplete="new-password" required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
            </label>
            {error && <p className="admin-auth-error" role="alert">{error}</p>}
            <button className="admin-button button-primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Updating…' : 'Update password'}
            </button>
          </form>
        )}

        {state === 'updated' && (
          <div className="admin-auth-state" role="status">
            <strong>Password updated</strong>
            <p>You can now sign in with your new password.</p>
          </div>
        )}

        <Link className="admin-auth-link" href="/admin/login/main">Main Admin sign in</Link>
        <Link className="admin-auth-link" href="/admin/login/sub-admin">Sub-Admin sign in</Link>
        <Link className="admin-auth-link" href="/student/login">Student sign in</Link>
      </section>
    </div>
  );
}
