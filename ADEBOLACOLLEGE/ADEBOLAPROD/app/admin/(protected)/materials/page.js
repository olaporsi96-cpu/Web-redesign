'use client';

import { useEffect, useState } from 'react';
import { createClient } from '../../../../utils/supabase/client';
import { ConfirmDialog, EmptyState, PageHeading, RetryState, Toast } from '../../_components/admin-ui';
import { loadMaterials, removeMaterialAction, saveMaterialAction } from '../catalogue-actions';

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const allowedTypes = new Set(['application/pdf', 'video/mp4']);
const extensionOf = (fileName) => fileName.toLowerCase().split('.').pop();

export default function MaterialsPage() {
  const [courses, setCourses] = useState([]);
  const [lessons, setLessons] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [selected, setSelected] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [toast, setToast] = useState('');

  async function refresh() {
    setLoading(true);
    setLoadError('');
    try {
      const result = await loadMaterials();
      if (!result.ok) setLoadError(result.error);
      else {
        setCourses(result.data.courses);
        setLessons(result.data.lessons.filter((lesson) => lesson.status !== 'archived'));
        setMaterials(result.data.materials);
      }
    } catch (loadError) {
      setLoadError(loadError instanceof Error ? loadError.message : 'Unable to load course materials.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { refresh(); }, []);
  useEffect(() => () => {
    if (selected?.previewUrl) URL.revokeObjectURL(selected.previewUrl);
  }, [selected]);

  function chooseFile(lesson, event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const extension = extensionOf(file.name);
    const isAllowedFile = allowedTypes.has(file.type)
      || (extension === 'pdf' && !file.type)
      || (extension === 'mp4' && !file.type);
    if (!isAllowedFile || file.size > MAX_FILE_BYTES) {
      setError('Choose a PDF or MP4 file no larger than 50 MB.');
      return;
    }
    if (selected?.previewUrl) URL.revokeObjectURL(selected.previewUrl);
    setSelected({ lesson, file, previewUrl: URL.createObjectURL(file) });
    setError('');
  }

  async function uploadSelected() {
    if (!selected) return;
    const { lesson, file } = selected;
    const course = courses.find((item) => item.id === lesson.course_id);
    if (!course) { setError('Course record is unavailable.'); return; }
    setBusy(lesson.id);
    setError('');
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-150);
    const path = `${course.id}/${lesson.id}/${crypto.randomUUID()}-${safeName}`;
    const supabase = createClient();
    let uploaded = false;
    try {
      const { error: uploadError } = await supabase.storage.from('course-materials').upload(path, file, {
        contentType: file.type || (extensionOf(file.name) === 'mp4' ? 'video/mp4' : 'application/pdf'),
        upsert: false,
      });
      if (uploadError) throw uploadError;
      uploaded = true;
      const result = await saveMaterialAction(lesson.id, path, file.name, file.type || (extensionOf(file.name) === 'mp4' ? 'video/mp4' : 'application/pdf'));
      if (!result.ok) throw new Error(result.error);
      setToast(result.warning || `Private material saved for ${lesson.title}.`);
      setSelected(null);
      await refresh();
    } catch (uploadError) {
      let cleanupMessage = '';
      if (uploaded) {
        const { error: cleanupError } = await supabase.storage.from('course-materials').remove([path]);
        if (cleanupError) cleanupMessage = ` Uploaded file cleanup failed: ${cleanupError.message}`;
      }
      setError(`${uploadError instanceof Error ? uploadError.message : 'Unable to save the course material.'}${cleanupMessage}`);
    } finally {
      setBusy('');
    }
  }

  async function remove() {
    const result = await removeMaterialAction(removing.lesson_id);
    setRemoving(null);
    if (!result.ok) setError(result.error);
    else { setToast('Lesson material removed.'); await refresh(); }
  }

  return (
    <>
      <PageHeading title="Course Materials" description="Upload PDF or MP4 lesson files to private storage. Students need an approved course-access grant to view them." />
      {error && <p className="field-error" role="alert">{error}</p>}
      <section className="admin-panel">
        <div className="panel-heading"><div><h2>Lesson materials</h2><p>Files are not served from public URLs.</p></div></div>
        {loading ? <p className="admin-empty-inline" role="status">Loading lesson materials…</p> : loadError ? (
          <RetryState message={loadError} onRetry={refresh} loading={loading} />
        ) : lessons.length ? (
          <div className="admin-table-wrap"><table className="admin-table">
            <thead><tr><th>Lesson</th><th>Course</th><th>File</th><th>Actions</th></tr></thead>
            <tbody>{lessons.map((lesson) => {
              const material = materials.find((item) => item.lesson_id === lesson.id);
              const fileInputId = `material-file-${lesson.id}`;
              return <tr key={lesson.id}>
                <td><strong>{lesson.title}</strong></td>
                <td>{courses.find((item) => item.id === lesson.course_id)?.title || 'Unavailable'}</td>
                <td>{material ? `${material.file_name} (${material.mime_type})` : 'No material uploaded'}</td>
                <td><div className="row-actions">
                  <input id={fileInputId} className="file-picker-input" type="file" accept="application/pdf,video/mp4,.pdf,.mp4" disabled={Boolean(busy)} onChange={(event) => chooseFile(lesson, event)} aria-label={`Select private PDF or video material for ${lesson.title}`} />
                  <label htmlFor={fileInputId} className="text-button file-action-label">
                    {selected?.lesson.id === lesson.id ? 'Change selection' : material ? 'Replace' : 'Select file'}
                  </label>
                  {material && <button type="button" className="text-button text-danger" onClick={() => setRemoving(material)}>
                    {material.mime_type === 'video/mp4' ? 'Delete video' : 'Delete file'}
                  </button>}
                </div></td>
              </tr>;
            })}</tbody>
          </table></div>
        ) : <EmptyState title="No lessons yet" description="Add lesson records before uploading lesson materials." />}
        {selected && (
          <div className="material-upload-preview">
            <p><strong>{selected.lesson.title}</strong> · {selected.file.name} · {(selected.file.size / (1024 * 1024)).toFixed(1)} MB</p>
            {extensionOf(selected.file.name) === 'pdf'
              ? <iframe title={`Preview of ${selected.file.name}`} className="material-document-preview" src={selected.previewUrl} />
              : <video className="material-video-preview" controls preload="metadata" src={selected.previewUrl}>Your browser does not support video playback.</video>}
            {busy && <progress className="upload-progress" aria-label="Course material upload in progress" />}
            <button type="button" className="admin-button button-primary" disabled={Boolean(busy)} onClick={uploadSelected}>
              {busy ? 'Uploading…' : 'Upload selected material'}
            </button>
          </div>
        )}
      </section>
      {removing && <ConfirmDialog
        title={removing.mime_type === 'video/mp4' ? 'Delete lesson video?' : 'Delete lesson file?'}
        description={`Delete the private file “${removing.file_name}”? Learners will no longer be able to open it.`}
        confirmLabel={removing.mime_type === 'video/mp4' ? 'Delete video' : 'Delete file'}
        onCancel={() => setRemoving(null)}
        onConfirm={remove}
      />}
      <Toast message={toast} onDismiss={() => setToast('')} />
    </>
  );
}
