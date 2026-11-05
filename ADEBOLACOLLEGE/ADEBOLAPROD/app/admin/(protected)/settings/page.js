'use client';

import { useEffect, useState } from 'react';
import { PageHeading, RetryState, Toast } from '../../_components/admin-ui';
import { courseCategories } from '../../_components/course-form';
import { loadCatalogueSettings, saveCatalogueSettingsAction } from '../catalogue-actions';

const emptyCategories = courseCategories.map((category) => ({
  category, codePrefix: '', codeStart: '', codeEnd: '',
}));

export default function SettingsPage() {
  const [settings, setSettings] = useState(emptyCategories);
  const [payments, setPayments] = useState({ bankName: '', accountName: '', accountNumber: '' });
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  async function refresh() {
    setLoading(true);
    setLoadError('');
    try {
      const result = await loadCatalogueSettings();
      if (!result.ok) throw new Error(result.error);
      setSettings(emptyCategories.map((item) => {
        const saved = result.data.categories.find((entry) => entry.category === item.category);
        return saved ? {
          category: item.category,
          codePrefix: saved.code_prefix || '',
          codeStart: saved.code_start ?? '',
          codeEnd: saved.code_end ?? '',
        } : item;
      }));
      setPayments({
        bankName: result.data.payments?.bank_name || '',
        accountName: result.data.payments?.account_name || '',
        accountNumber: result.data.payments?.account_number || '',
      });
    } catch (loadFailure) {
      setLoadError(loadFailure instanceof Error ? loadFailure.message : 'Unable to load catalogue settings.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  function updateCategory(category, field, value) {
    setSettings((current) => current.map((item) => item.category === category ? { ...item, [field]: value } : item));
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    setSaving(true);
    const categorySettings = settings.map((item) => ({
      category: item.category,
      codePrefix: item.codePrefix.trim(),
      codeStart: item.codeStart === '' ? null : Number(item.codeStart),
      codeEnd: item.codeEnd === '' ? null : Number(item.codeEnd),
    }));
    const bankIsEmpty = Object.values(payments).every((value) => !value.trim());
    const bankIsComplete = Object.values(payments).every((value) => value.trim());
    if (!bankIsEmpty && !bankIsComplete) {
      setError('Enter all three bank details or leave all three blank to hide bank details.');
      setSaving(false);
      return;
    }
    const result = await saveCatalogueSettingsAction(categorySettings, {
      bankName: bankIsEmpty ? '' : payments.bankName.trim(),
      accountName: bankIsEmpty ? '' : payments.accountName.trim(),
      accountNumber: bankIsEmpty ? '' : payments.accountNumber.trim(),
    });
    setSaving(false);
    if (!result.ok) setError(result.error);
    else setToast('Catalogue and bank-transfer settings saved.');
  }

  return (
    <>
      <PageHeading title="Catalogue settings" description="Configure lesson-code ranges and manual bank-transfer details." />
      {error && <p className="field-error" role="alert">{error}</p>}
      {loading ? (
        <div className="admin-panel admin-empty-inline" role="status">Loading catalogue settings…</div>
      ) : loadError ? (
        <RetryState message={loadError} onRetry={refresh} loading={loading} />
      ) : (
        <section className="admin-panel catalogue-settings-panel">
          <form className="admin-form" onSubmit={submit}>
          {settings.map((item) => (
            <fieldset className="catalogue-setting-card" key={item.category}>
              <legend>{item.category}</legend>
              <label>Optional lesson-code prefix
                <input maxLength={20} value={item.codePrefix} onChange={(event) => updateCategory(item.category, 'codePrefix', event.target.value)} />
              </label>
              <div className="settings-range-grid">
                <label>Starting number
                  <input type="number" min="1" step="1" value={item.codeStart} onChange={(event) => updateCategory(item.category, 'codeStart', event.target.value)} />
                </label>
                <label>Ending number
                  <input type="number" min="1" step="1" value={item.codeEnd} onChange={(event) => updateCategory(item.category, 'codeEnd', event.target.value)} />
                </label>
              </div>
              <p className="field-hint">New lesson codes use the configured prefix and next available number. Set a start and end number to enable automatic assignment.</p>
            </fieldset>
          ))}
          <fieldset className="catalogue-setting-card">
            <legend>Bank transfer details</legend>
            <p className="field-hint">Bank details are hidden from learners until all three fields are saved.</p>
            <label>Bank name<input maxLength={100} value={payments.bankName} onChange={(event) => setPayments({ ...payments, bankName: event.target.value })} /></label>
            <label>Account name<input maxLength={100} value={payments.accountName} onChange={(event) => setPayments({ ...payments, accountName: event.target.value })} /></label>
            <label>Account number<input maxLength={40} value={payments.accountNumber} onChange={(event) => setPayments({ ...payments, accountNumber: event.target.value })} /></label>
          </fieldset>
          <div className="dialog-actions">
            <button type="submit" className="admin-button button-primary" disabled={saving}>{saving ? 'Saving…' : 'Save settings'}</button>
          </div>
          </form>
        </section>
      )}
      <Toast message={toast} onDismiss={() => setToast('')} />
    </>
  );
}
