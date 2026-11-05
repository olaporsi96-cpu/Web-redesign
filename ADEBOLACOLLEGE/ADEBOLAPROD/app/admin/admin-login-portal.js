'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '../../utils/supabase/client';

export default function AdminLoginPortal() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('error') === 'unauthorized') {
      setError('This account does not have the Main Admin role.');
    }
  }, []);

  async function signIn(event) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const supabase = createClient();
      const { data: authData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError(signInError.message);
        return;
      }

      if (!authData.user) {
        const { error: signOutError } = await supabase.auth.signOut();
        setError(signOutError
          ? `Unable to verify the signed-in user, and sign-out failed: ${signOutError.message}`
          : 'Unable to verify the signed-in user. Please try again.');
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', authData.user.id)
        .maybeSingle();

      if (profileError || !profile || profile.role !== 'main_admin') {
        const verificationError = profileError
          ? `Unable to verify the account profile: ${profileError.message}`
          : !profile
            ? 'No profile was found for the authenticated account.'
            : 'This account does not have the Main Admin role.';
        const { error: signOutError } = await supabase.auth.signOut();
        setError(signOutError
          ? `${verificationError} Sign-out failed: ${signOutError.message}`
          : verificationError);
        return;
      }

      router.replace('/admin');
      router.refresh();
    } catch (signInError) {
      setError(signInError instanceof Error ? signInError.message : 'Unable to sign in. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="admin-access-page">
      <section className="admin-auth-card">
        <Image src="/images/NewPics/Pix25-SchoolLogo.jpg" alt="Adebola College crest" width={90} height={92} />
        <span className="admin-auth-label">MAIN ADMIN</span>
        <h1>Main Admin sign in</h1>
        <p>Sign in with the email and password for the verified Main Admin account.</p>

        <form className="admin-auth-form" onSubmit={signIn}>
          <label>
            Email address
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error && <p className="admin-auth-error" role="alert">{error}</p>}
          <button className="admin-button button-primary" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <Link className="admin-auth-link" href="/admin/password-recovery">Forgot your password?</Link>
        <Link className="admin-auth-link" href="/">Return to the public website</Link>
      </section>
    </div>
  );
}
