'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '../../utils/supabase/client';
import adminAuthorization from '../../utils/admin-authorization.cjs';

const { getAdminLandingPath } = adminAuthorization;

export default function SubAdminLoginPortal({ archivingEnabled }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const status = new URLSearchParams(window.location.search).get('error');
    if (status === 'invalid-invite' || status === 'invite-verification') {
      setError('This invitation link is invalid or expired. Ask the Main Admin to send a new invitation.');
    } else if (status === 'unauthorized') {
      setError('This account does not have permission to access that Admin area.');
    } else if (status === 'archived') {
      setError('This Sub-Admin account is archived and cannot sign in. Ask the Main Admin to restore it if access is needed.');
    }
  }, []);

  async function submit(event) {
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
      if (!authData.user) throw new Error('Supabase did not return an authenticated user.');

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select(archivingEnabled ? 'role, sub_admin_archived_at' : 'role')
        .eq('id', authData.user.id)
        .maybeSingle();
      if (profileError) {
        const { error: signOutError } = await supabase.auth.signOut();
        throw new Error(signOutError
          ? `Unable to verify your Admin profile: ${profileError.message}. Sign-out failed: ${signOutError.message}`
          : `Unable to verify your Admin profile: ${profileError.message}`);
      }
      if (!profile) {
        const { error: signOutError } = await supabase.auth.signOut();
        throw new Error(signOutError
          ? `No profile was found for the authenticated account. Sign-out failed: ${signOutError.message}`
          : 'No profile was found for the authenticated account.');
      }
      if (profile.role !== 'sub_admin') {
        const { error: signOutError } = await supabase.auth.signOut();
        setError(signOutError
          ? `This account does not have the Sub-Admin role. Sign-out failed: ${signOutError.message}`
          : 'This account does not have the Sub-Admin role.');
        return;
      }
      if (archivingEnabled && profile.sub_admin_archived_at) {
        const { error: signOutError } = await supabase.auth.signOut();
        setError(signOutError
          ? `This Sub-Admin account is archived. Sign-out failed: ${signOutError.message}`
          : 'This Sub-Admin account is archived and cannot sign in. Ask the Main Admin to restore it if access is needed.');
        return;
      }

      const { data: permissionRows, error: permissionsError } = await supabase
        .from('admin_permissions')
        .select('permission_key')
        .eq('profile_id', authData.user.id);
      if (permissionsError) {
        const { error: signOutError } = await supabase.auth.signOut();
        throw new Error(signOutError
          ? `Unable to verify assigned Sub-Admin permissions: ${permissionsError.message}. Sign-out failed: ${signOutError.message}`
          : `Unable to verify assigned Sub-Admin permissions: ${permissionsError.message}`);
      }

      const permissions = permissionRows.map((row) => row.permission_key);
      router.replace(getAdminLandingPath(profile, permissions));
      router.refresh();
      return;
    } catch (signInError) {
      setError(signInError instanceof Error ? signInError.message : 'Unable to sign in.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="admin-access-page">
      <section className="admin-auth-card">
        <Image src="/images/NewPics/Pix25-SchoolLogo.jpg" alt="Adebola College crest" width={90} height={92} />
        <span className="admin-auth-label">SUB-ADMIN</span>
        <h1>Sub-Admin sign in</h1>
        <p>Use the account and password created from your Main Admin invitation.</p>
        <form className="admin-auth-form" onSubmit={submit}>
          <label>
            Email address
            <input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label>
            Password
            <input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          {error && <p className="admin-auth-error" role="alert">{error}</p>}
          <button className="admin-button button-primary" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <Link className="admin-auth-link" href="/admin/password-recovery">Forgot your password?</Link>
        <Link className="admin-auth-link" href="/admin/login/main">Main Admin sign in</Link>
        <Link className="admin-auth-link" href="/">Return to the public website</Link>
      </section>
    </div>
  );
}
