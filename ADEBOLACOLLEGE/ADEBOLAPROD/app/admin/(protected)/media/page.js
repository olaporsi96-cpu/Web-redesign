'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '../../../../utils/supabase/client';
import { PageHeading } from '../../_components/admin-ui';
import { loadEducationalVideo, saveEducationalVideo } from './actions';

const MAX_VIDEO_BYTES = 250 * 1024 * 1024;
const bucket = 'elearning-public-media';

export default function EducationalVideoAdminPage() {
  const [current, setCurrent] = useState(null);
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [published, setPublished] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const objectUrl = useRef('');

  async function refresh() {
    setLoading(true);
    const response = await loadEducationalVideo();
    if (response.ok) {
      setCurrent(response.video);
      setPublished(response.video?.published || false);
      setError('');
    } else setError(response.error);
    setLoading(false);
  }

  useEffect(() => { refresh(); }, []);
  useEffect(() => () => { if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); }, []);

  function chooseFile(event) {
    const next = event.target.files?.[0] || null;
    event.target.value = '';
    setMessage('');
    if (!next) return;
    if (next.type !== 'video/mp4' || next.size > MAX_VIDEO_BYTES) {
      setError('Select an MP4 video no larger than 250 MB.');
      return;
    }
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = URL.createObjectURL(next);
    setPreviewUrl(objectUrl.current);
    setFile(next);
    setError('');
  }

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    let uploadedPath = '';
    try {
      const supabase = createClient();
      let path = current?.video_path;
      let fileName = current?.video_file_name;
      if (file) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-150);
        path = `general/${crypto.randomUUID()}-${safeName}`;
        fileName = file.name;
        const { error: uploadError } = await supabase.storage.from(bucket).upload(path, file, {
          contentType: 'video/mp4',
          upsert: false,
        });
        if (uploadError) throw uploadError;
        uploadedPath = path;
      }
      if (!path || !fileName) throw new Error('Select an MP4 video before saving.');
      const response = await saveEducationalVideo({ path, fileName, published });
      if (!response.ok) throw new Error(response.error);
      if (current?.video_path && current.video_path !== path) {
        const { error: removeError } = await supabase.storage.from(bucket).remove([current.video_path]);
        if (removeError) setMessage(`Video published, but the replaced file could not be removed: ${removeError.message}`);
      }
      setFile(null);
      setPreviewUrl('');
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = '';
      setMessage((previous) => previous || (published ? 'Educational video published.' : 'Educational video saved as unpublished.'));
      await refresh();
    } catch (saveError) {
      let cleanupMessage = '';
      if (uploadedPath) {
        const supabase = createClient();
        const { error: cleanupError } = await supabase.storage.from(bucket).remove([uploadedPath]);
        if (cleanupError) cleanupMessage = ` The uploaded file could not be removed: ${cleanupError.message}`;
      }
      setError(`${saveError instanceof Error ? saveError.message : 'Unable to upload or save the educational video.'}${cleanupMessage}`);
    } finally {
      setBusy(false);
    }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const currentUrl = current?.video_path && supabaseUrl
    ? `${supabaseUrl}/storage/v1/object/public/${bucket}/${current.video_path.split('/').map(encodeURIComponent).join('/')}`
    : '';

  return (
    <>
      <PageHeading title="E-Learning feature video" description="Upload, preview, publish, or replace the general educational video shown on the public E-Learning page." />
      {error && <p className="admin-auth-error" role="alert">{error}</p>}
      {message && <p className="admin-info-callout" role="status">{message}</p>}
      {loading ? <p className="admin-empty-inline" role="status">Loading video settings…</p> : (
        <section className="admin-panel educational-video-panel">
          <form className="admin-form" onSubmit={save}>
            <label>Choose an MP4 video (maximum 250 MB)
              <input type="file" accept="video/mp4,.mp4" onChange={chooseFile} disabled={busy} />
            </label>
            {previewUrl ? <video className="educational-video-preview" controls preload="metadata" src={previewUrl}>Your browser does not support video playback.</video>
              : currentUrl ? <video className="educational-video-preview" controls preload="metadata" src={currentUrl}>Your browser does not support video playback.</video>
                : <p className="admin-form-note">No video is saved yet. The public page will show a clearly marked placeholder until a video is published.</p>}
            {file && <p className="field-hint">Selected: {file.name} · {(file.size / (1024 * 1024)).toFixed(1)} MB</p>}
            {busy && <progress className="upload-progress" aria-label="Video upload in progress" />}
            <label className="video-publish-option"><input type="checkbox" checked={published} onChange={(event) => setPublished(event.target.checked)} disabled={busy} /> Publish on the public E-Learning page</label>
            <div className="dialog-actions"><button className="admin-button button-primary" type="submit" disabled={busy || (!file && !current?.video_path)}>{busy ? 'Uploading and saving…' : current ? 'Save video settings' : 'Upload and save video'}</button></div>
          </form>
        </section>
      )}
    </>
  );
}
