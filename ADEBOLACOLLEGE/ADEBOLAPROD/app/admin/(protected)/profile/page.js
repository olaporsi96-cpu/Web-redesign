'use client';

import { ADMIN_PERMISSION_DEFINITIONS, useAdmin } from '../../admin-provider';
import { PageHeading } from '../../_components/admin-ui';

export default function AdminProfilePage() {
  const { adminProfile } = useAdmin();
  const mainAdmin = adminProfile.role === 'main_admin';
  const permissions = mainAdmin
    ? ADMIN_PERMISSION_DEFINITIONS.map((permission) => permission.key)
    : adminProfile.permissions;

  return (
    <>
      <PageHeading
        title="Profile & settings"
        description="Review your authenticated Admin account and assigned access."
      />
      <section className="admin-panel admin-profile-panel">
        <div className="admin-profile-avatar" aria-hidden="true">{adminProfile.displayName.slice(0, 1)}</div>
        <div className="admin-profile-details">
          <h2>{adminProfile.displayName}</h2>
          <dl>
            <div><dt>Role</dt><dd>{mainAdmin ? 'Main Admin' : 'Sub-Admin'}</dd></div>
            <div><dt>Account email</dt><dd>{adminProfile.email}</dd></div>
            <div><dt>Authentication</dt><dd>Supabase Auth</dd></div>
            <div><dt>Session</dt><dd>Authenticated Supabase session</dd></div>
          </dl>
        </div>
      </section>
      <section className="admin-panel admin-profile-permissions">
        <div className="panel-heading"><div><h2>Assigned access</h2><p>Permissions enforced on protected routes and server operations.</p></div></div>
        <ul>
          {ADMIN_PERMISSION_DEFINITIONS.filter((permission) => permissions.includes(permission.key)).map((permission) => (
            <li key={permission.key}><span aria-hidden="true">✓</span>{permission.label}</li>
          ))}
          {!mainAdmin && permissions.length === 0 && <li>No module permissions are assigned to this account.</li>}
        </ul>
      </section>
    </>
  );
}
