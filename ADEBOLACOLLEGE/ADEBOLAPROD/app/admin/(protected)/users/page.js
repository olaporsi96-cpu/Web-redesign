'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { ADMIN_PERMISSION_DEFINITIONS } from '../../admin-provider';
import { ConfirmDialog, EmptyState, PageHeading, RetryState } from '../../_components/admin-ui';
import {
  inviteSubAdmin,
  listSubAdmins,
  sendSubAdminAccessEmail,
  saveSubAdminPermissions,
  setSubAdminArchived,
} from './actions';

const editablePermissions = ADMIN_PERMISSION_DEFINITIONS.filter((permission) => !permission.mainAdminOnly);

function SubAdminForm({ account, onSave, onClose }) {
  const [name, setName] = useState(account?.name || '');
  const [email, setEmail] = useState(account?.email || '');
  const [permissions, setPermissions] = useState(account?.permissions || []);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);
  const [invitationNeedsReview, setInvitationNeedsReview] = useState(false);

  function togglePermission(permission, checked) {
    setPermissions((current) => {
      if (checked && permission === 'release_results') {
        return [...new Set([...current, 'manage_results', permission])];
      }
      if (!checked && permission === 'manage_results') {
        return current.filter((item) => !['manage_results', 'release_results'].includes(item));
      }
      return checked
        ? [...new Set([...current, permission])]
        : current.filter((item) => item !== permission);
    });
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    setIsSaving(true);
    try {
      const response = await onSave({ name, email, permissions });
      if (!response.ok) {
        setError(response.error);
        setRateLimited(Boolean(response.rateLimited));
        setInvitationNeedsReview(Boolean(response.invitationCreated));
        if (response.invitationCreated) setRateLimited(true);
        return;
      }
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save the Sub-Admin account.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !isSaving) onClose();
    }}>
      <section className="form-dialog subadmin-form-dialog" role="dialog" aria-modal="true" aria-labelledby="subadmin-form-title">
        <div className="dialog-header">
          <h2 id="subadmin-form-title">{account ? 'Edit Sub-Admin permissions' : 'Invite Sub-Admin'}</h2>
          <button type="button" className="icon-button" aria-label="Close dialog" onClick={onClose} disabled={isSaving}>×</button>
        </div>
        <form className="admin-form" onSubmit={submit}>
          <p className="admin-form-note">
            {account
              ? 'Changes take effect immediately. Sub-Admins cannot manage Admin accounts or grant permissions.'
              : 'An invitation email will be sent. The invited person sets their own password before signing in.'}
          </p>
          {!account && (
            <p className="admin-form-note">
              TEST email delivery is limited to 2 emails per hour and SMTP is disabled. Normal school delivery requires a verified sending domain and configured SMTP provider. Failed invitations are not reported as sent.
            </p>
          )}
          <label>
            Name
            <input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} required />
          </label>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              maxLength={254}
              required
              readOnly={Boolean(account)}
              disabled={rateLimited}
            />
          </label>
          <fieldset className="subadmin-form-permissions">
            <legend>Permissions</legend>
            <p className="admin-form-note">Releasing results requires the Create and update student results permission.</p>
            {editablePermissions.map((permission) => (
              <label key={permission.key}>
                <input
                  type="checkbox"
                  checked={permissions.includes(permission.key)}
                  onChange={(event) => togglePermission(permission.key, event.target.checked)}
                  disabled={rateLimited}
                />
                <span>{permission.label}</span>
              </label>
            ))}
          </fieldset>
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
                    : account
                      ? 'Save changes'
                      : 'Send invitation'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default function AdminUsersPage() {
  const [accounts, setAccounts] = useState([]);
  const [archivingEnabled, setArchivingEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [editing, setEditing] = useState(undefined);
  const [view, setView] = useState('active');
  const [confirming, setConfirming] = useState(null);
  const [emailingId, setEmailingId] = useState(null);
  const [blockedEmailIds, setBlockedEmailIds] = useState(() => new Set());
  const [toast, setToast] = useState('');

  async function loadAccounts() {
    setIsLoading(true);
    setLoadError('');
    try {
      const response = await listSubAdmins();
      if (!response.ok) throw new Error(response.error);
      setAccounts(response.accounts);
      setArchivingEnabled(Boolean(response.archivingEnabled));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Unable to load Sub-Admin accounts.');
      setAccounts([]);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadAccounts();
  }, []);

  async function saveAccount(account) {
    const response = editing
      ? await saveSubAdminPermissions({ ...account, id: editing.id })
      : await inviteSubAdmin(account);
    if (response.ok) {
      setToast(editing ? 'Sub-Admin permissions saved.' : 'Invitation sent.');
      await loadAccounts();
    }
    return response;
  }

  const visibleAccounts = accounts.filter((account) => Boolean(account.archivedAt) === (view === 'archived'));

  async function toggleArchived(account) {
    const archived = !account.archivedAt;
    const response = await setSubAdminArchived(account.id, archived);
    if (!response.ok) {
      setToast(response.error);
      return;
    }
    setToast(archived
      ? 'Sub-Admin archived. The Auth account and assigned permissions were preserved.'
      : 'Sub-Admin restored with the original assigned permissions.');
    await loadAccounts();
  }

  async function sendAccessEmail(account) {
    setEmailingId(account.id);
    try {
      const response = await sendSubAdminAccessEmail(account.id);
      setToast(response.ok ? 'Password-recovery email sent.' : response.error);
      if (response.rateLimited || response.unavailable) {
        setBlockedEmailIds((current) => new Set(current).add(account.id));
      }
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Unable to send the account email.');
    } finally {
      setEmailingId(null);
    }
  }

  return (
    <>
      <div className="page-heading-row admin-users-heading">
        <PageHeading title="Admin users" description="Manage Sub-Admin accounts and their assigned workspace permissions." />
        <button type="button" className="admin-button button-primary" onClick={() => setEditing(null)}>＋ Invite Sub-Admin</button>
      </div>
      {archivingEnabled && (
        <div className="subadmin-view-tabs" role="group" aria-label="Sub-Admin account status">
          <button type="button" className={view === 'active' ? 'is-selected' : ''} aria-pressed={view === 'active'} onClick={() => setView('active')}>
            Active ({accounts.filter((account) => !account.archivedAt).length})
          </button>
          <button type="button" className={view === 'archived' ? 'is-selected' : ''} aria-pressed={view === 'archived'} onClick={() => setView('archived')}>
            Archived ({accounts.filter((account) => account.archivedAt).length})
          </button>
        </div>
      )}
      {isLoading ? (
        <div className="admin-panel admin-empty-inline" role="status">Loading Sub-Admin accounts…</div>
      ) : loadError ? (
        <RetryState message={loadError} onRetry={loadAccounts} loading={isLoading} />
      ) : visibleAccounts.length ? (
        <div className="admin-user-cards">
          {visibleAccounts.map((account) => (
            <section className="admin-panel subadmin-card" key={account.id}>
              <div className="subadmin-card-header">
                <Image src="/images/NewPics/Pix25-SchoolLogo.jpg" alt="" width={42} height={43} />
                <div>
                  <h2>{account.name}</h2>
                  <p>{account.email} · Sub-Admin</p>
                </div>
                <span className="subadmin-status">
                  {account.archivedAt ? 'Archived' : 'Permission-based access'}
                </span>
              </div>
              <div className="subadmin-permissions">
                <h3>Granted permissions</h3>
                {account.permissions.length
                  ? account.permissions.map((permission) => (
                    <span className="permission-chip" key={permission}>
                      {editablePermissions.find((item) => item.key === permission)?.label || permission}
                    </span>
                  ))
                  : <p>No permissions granted.</p>}
              </div>
              <div className="subadmin-actions">
                {!account.archivedAt && (
                  <>
                    <button type="button" className="admin-button button-secondary" onClick={() => setEditing(account)}>
                      Edit permissions
                    </button>
                    <button
                      type="button"
                      className="admin-button button-secondary"
                      onClick={() => sendAccessEmail(account)}
                      disabled={emailingId === account.id || blockedEmailIds.has(account.id)}
                    >
                      {emailingId === account.id ? 'Checking…' : blockedEmailIds.has(account.id) ? 'Email unavailable' : 'Access email'}
                    </button>
                  </>
                )}
                {archivingEnabled && (
                  <button type="button" className="admin-button button-secondary" onClick={() => setConfirming(account)}>
                    {account.archivedAt ? 'Restore' : 'Archive'}
                  </button>
                )}
              </div>
              <p role="note">
                {account.archivedAt
                  ? 'This account cannot sign in or use Admin permissions while archived. Its existing permission assignments are preserved.'
                  : 'Sub-Admins can access only the workspace areas covered by their assigned permissions.'}
              </p>
            </section>
          ))}
        </div>
      ) : (
        <EmptyState
          title={view === 'archived' ? 'No archived Sub-Admin accounts' : 'No active Sub-Admin accounts'}
          description={view === 'archived'
            ? 'Archived accounts will appear here and can be restored without changing their permissions.'
            : 'Invite a Sub-Admin when you are ready to grant access.'}
          action={view === 'active'
            ? <button type="button" className="admin-button button-primary" onClick={() => setEditing(null)}>Invite Sub-Admin</button>
            : null}
        />
      )}
      {editing !== undefined && (
        <SubAdminForm
          key={editing?.id || 'new-subadmin'}
          account={editing}
          onSave={saveAccount}
          onClose={() => setEditing(undefined)}
        />
      )}
      {confirming && (
        <ConfirmDialog
          title={confirming.archivedAt ? 'Restore this Sub-Admin?' : 'Archive this Sub-Admin?'}
          description={confirming.archivedAt
            ? `${confirming.name} will regain access through the existing Auth account with the same assigned permissions.`
            : `${confirming.name} will lose access to Admin pages and actions. The Auth account and permission assignments will be preserved.`}
          confirmLabel={confirming.archivedAt ? 'Restore Sub-Admin' : 'Archive Sub-Admin'}
          onCancel={() => setConfirming(null)}
          onConfirm={async () => {
            await toggleArchived(confirming);
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
