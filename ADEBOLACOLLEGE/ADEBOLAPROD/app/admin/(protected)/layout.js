import { redirect } from 'next/navigation';
import { AdminProvider } from '../admin-provider';
import { AdminShell } from '../admin-shell';
import { createClient } from '../../../utils/supabase/server';
import adminAuthorization from '../../../utils/admin-authorization.cjs';
import accountArchiving from '../../../utils/account-archiving.cjs';

const { isAdminEnabledProfile, isMainAdminProfile } = adminAuthorization;
const { profileSelectColumns, isAccountArchivingEnabled } = accountArchiving;

export const dynamic = 'force-dynamic';

export default async function ProtectedAdminLayout({ children }) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError && authError.name !== 'AuthSessionMissingError') {
    throw new Error(`Unable to verify the Supabase session: ${authError.message}`);
  }
  if (!user) redirect('/admin/login/main');

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select(profileSelectColumns('id, display_name, email, role, admin_enabled'))
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) {
    throw new Error(`Unable to retrieve the authenticated profile: ${profileError.message}`);
  }
  if (!profile || (!isMainAdminProfile(profile) && profile.role !== 'sub_admin')) {
    redirect('/admin/login/main?error=unauthorized');
  }
  if (!isAdminEnabledProfile(profile)) {
    redirect(profile.role === 'sub_admin'
      ? '/admin/login/sub-admin?error=disabled'
      : '/admin/login/main?error=disabled');
  }
  if (isAccountArchivingEnabled() && profile.role === 'sub_admin' && profile.sub_admin_archived_at) {
    redirect('/admin/login/sub-admin?error=archived');
  }

  let permissions = [];
  if (!isMainAdminProfile(profile)) {
    const { data: permissionRows, error: permissionsError } = await supabase
      .from('admin_permissions')
      .select('permission_key')
      .eq('profile_id', user.id);
    if (permissionsError) {
      throw new Error(`Unable to retrieve the authenticated Sub-Admin permissions: ${permissionsError.message}`);
    }
    permissions = permissionRows.map((row) => row.permission_key);
  }

  return (
    <AdminProvider key={profile.id} initialProfile={{ ...profile, permissions }}>
      <AdminShell>{children}</AdminShell>
    </AdminProvider>
  );
}
