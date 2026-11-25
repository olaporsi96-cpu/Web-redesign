'use client';

import { useEffect, useState } from 'react';
import { createClient } from '../../../../utils/supabase/client';
import { DEFAULT_WEBSITE_SETTINGS } from '../../../../utils/website-settings.cjs';
import { EmptyState, PageHeading, RetryState, Toast } from '../../_components/admin-ui';
import { loadWebsiteSettings, saveWebsiteSettings } from './actions';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const publicDestinations = [
  ['/admissions', 'Admissions'],
  ['/about-us', 'About Us'],
  ['/academics', 'Academics'],
  ['/student-life', 'Student Life'],
  ['/families', 'Families'],
  ['/e-learning', 'E-Learning'],
  ['/contact-us', 'Contact Us'],
];

export default function WebsiteSettingsPage() {
  const [settings, setSettings] = useState(DEFAULT_WEBSITE_SETTINGS);
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');

  useEffect(() => {
    let active = true;
    let objectUrl = '';
    async function refresh() {
      setLoading(true);
      setLoadError('');
      const result = await loadWebsiteSettings();
      if (!active) return;
      if (!result.ok) {
        setLoadError(result.error);
      } else {
        setSettings(result.settings);
      }
      setLoading(false);
    }
    refresh();
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, []);

  useEffect(() => {
    if (previewUrl.startsWith('blob:')) return () => URL.revokeObjectURL(previewUrl);
    return undefined;
  }, [previewUrl]);

  function update(field, value) {
    setSettings((current) => ({ ...current, [field]: value }));
  }

  function chooseImage(event) {
    const selected = event.target.files?.[0] || null;
    event.target.value = '';
    setError('');
    setToast('');
    if (!selected) return;
    const acceptedType = ['image/jpeg', 'image/png', 'image/webp'].includes(selected.type);
    if (!acceptedType || selected.size < 1 || selected.size > MAX_IMAGE_BYTES) {
      setError('Choose a non-empty JPEG, PNG, or WebP image no larger than 5 MB.');
      return;
    }
    setFile(selected);
    setPreviewUrl(URL.createObjectURL(selected));
  }

  function useDefaultImage() {
    setFile(null);
    setPreviewUrl('');
    update('heroImagePath', null);
    update('heroImageUrl', '');
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setToast('');
    let uploadedPath = '';
    try {
      let heroImagePath = settings.heroImagePath;
      if (file) {
        const extension = file.name.toLowerCase().split('.').pop();
        const path = `homepage/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await createClient().storage.from('website-assets').upload(path, file, {
          contentType: file.type,
          upsert: false,
        });
        if (uploadError) throw uploadError;
        uploadedPath = path;
        heroImagePath = path;
      }

      const result = await saveWebsiteSettings({ ...settings, heroImagePath });
      if (!result.ok) throw new Error(result.error);
      uploadedPath = '';
      setSettings((current) => ({ ...current, heroImagePath, heroImageUrl: '' }));
      setFile(null);
      setPreviewUrl('');
      setToast(result.warning || 'Website settings saved.');
    } catch (saveError) {
      let cleanupMessage = '';
      if (uploadedPath) {
        const { error: cleanupError } = await createClient().storage.from('website-assets').remove([uploadedPath]);
        if (cleanupError) cleanupMessage = ` The unused image could not be removed: ${cleanupError.message}`;
      }
      setError(`${saveError instanceof Error ? saveError.message : 'Unable to save website settings.'}${cleanupMessage}`);
    } finally {
      setBusy(false);
    }
  }

  const imagePreview = previewUrl || settings.heroImageUrl;

  return (
    <>
      <PageHeading title="Website settings" description="Manage public school contact details and the homepage hero without editing application code." />
      {error && <p className="field-error" role="alert">{error}</p>}
      {loading ? <p className="admin-empty-inline" role="status">Loading website settings…</p> : loadError ? (
        <RetryState message={loadError} onRetry={() => window.location.reload()} />
      ) : (
        <form className="admin-form" onSubmit={submit}>
          <section className="admin-panel">
            <div className="panel-heading"><div><h2>School contact information</h2><p>These details appear on the public website.</p></div></div>
            <div className="settings-range-grid">
              <label>Primary phone
                <input type="tel" maxLength={40} value={settings.contactPhonePrimary} onChange={(event) => update('contactPhonePrimary', event.target.value)} />
              </label>
              <label>Secondary phone
                <input type="tel" maxLength={40} value={settings.contactPhoneSecondary} onChange={(event) => update('contactPhoneSecondary', event.target.value)} />
              </label>
            </div>
            <label>General contact email
              <input type="email" required maxLength={254} value={settings.contactEmail} onChange={(event) => update('contactEmail', event.target.value)} />
            </label>
            <label>E-Learning email
              <input type="email" required maxLength={254} value={settings.elearningEmail} onChange={(event) => update('elearningEmail', event.target.value)} />
            </label>
          </section>

          <section className="admin-panel">
            <div className="panel-heading"><div><h2>Homepage hero</h2><p>Button destinations are restricted to existing internal public pages.</p></div></div>
            <label>Hero title
              <input required maxLength={140} value={settings.heroTitle} onChange={(event) => update('heroTitle', event.target.value)} />
            </label>
            <label>Hero description
              <textarea required rows={4} maxLength={600} value={settings.heroDescription} onChange={(event) => update('heroDescription', event.target.value)} />
            </label>
            <div className="settings-range-grid">
              <label>Primary button text
                <input required maxLength={40} value={settings.primaryButtonLabel} onChange={(event) => update('primaryButtonLabel', event.target.value)} />
              </label>
              <label>Primary button destination
                <select value={settings.primaryButtonHref} onChange={(event) => update('primaryButtonHref', event.target.value)}>
                  {publicDestinations.map(([href, label]) => <option key={href} value={href}>{label}</option>)}
                </select>
              </label>
              <label>Secondary button text
                <input required maxLength={40} value={settings.secondaryButtonLabel} onChange={(event) => update('secondaryButtonLabel', event.target.value)} />
              </label>
              <label>Secondary button destination
                <select value={settings.secondaryButtonHref} onChange={(event) => update('secondaryButtonHref', event.target.value)}>
                  {publicDestinations.map(([href, label]) => <option key={href} value={href}>{label}</option>)}
                </select>
              </label>
            </div>
            <label>Hero image description for screen readers
              <input required maxLength={160} value={settings.heroImageAlt} onChange={(event) => update('heroImageAlt', event.target.value)} />
            </label>
            <label>Replace homepage hero image (JPEG, PNG, or WebP; maximum 5 MB)
              <input type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" onChange={chooseImage} disabled={busy} />
            </label>
            {imagePreview ? (
              <img className="website-hero-image-preview" src={imagePreview} alt={settings.heroImageAlt} />
            ) : (
              <EmptyState title="Using the current school image" description="The existing school photograph remains in use until you upload a replacement." />
            )}
            {file && <p className="field-hint">Selected: {file.name} · {(file.size / (1024 * 1024)).toFixed(1)} MB</p>}
            {(file || settings.heroImagePath) && <button type="button" className="text-button" onClick={useDefaultImage} disabled={busy}>Use the existing school photograph</button>}
          </section>
          <div className="dialog-actions">
            <button type="submit" className="admin-button button-primary" disabled={busy}>{busy ? 'Saving website settings…' : 'Save website settings'}</button>
          </div>
        </form>
      )}
      <Toast message={toast} onDismiss={() => setToast('')} />
    </>
  );
}
