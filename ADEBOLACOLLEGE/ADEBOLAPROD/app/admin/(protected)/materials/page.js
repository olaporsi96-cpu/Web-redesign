'use client';

import { useEffect, useState } from 'react';
import { createClient } from '../../../../utils/supabase/client';
import { ConfirmDialog, EmptyState, FormDialog, PageHeading, RetryState, Toast } from '../../_components/admin-ui';
import { loadMaterials, removeMaterialAction, saveMaterialAction } from '../catalogue-actions';
import courseMaterialValidation from '../../../../utils/course-material.cjs';

const {
  MAX_COURSE_MATERIAL_BYTES,
  buildCourseMaterialPath,
  isAllowedCourseMaterialType,
  matchesCourseMaterialSignature,
} = courseMaterialValidation;
const extensionOf = (fileName) => fileName.toLowerCase().split('.').pop();

function uploadWithProgress(supabase, path, file, onProgress) {
  return supabase.auth.getSession().then(({ data, error }) => {
    if (error) throw error;
    const token = data.session?.access_token;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!token || !supabaseUrl || !publishableKey) {
      throw new Error('Supabase Storage authentication is unavailable.');
    }
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/course-materials/${path.split('/').map(encodeURIComponent).join('/')}`);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.setRequestHeader('apikey', publishableKey);
      xhr.setRequestHeader('x-upsert', 'false');
      xhr.setRequestHeader('Content-Type', file.type || (extensionOf(file.name) === 'mp4' ? 'video/mp4' : 'application/pdf'));
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else {
          let message = `Upload failed with HTTP ${xhr.status}.`;
          try {
            const response = JSON.parse(xhr.responseText);
            if (response.message) message = response.message;
          } catch {}
          reject(new Error(message));
        }
      };
      xhr.onerror = () => reject(new Error('The course material upload could not reach Storage.'));
      xhr.send(file);
    });
  });
}

export default function MaterialsPage() {
  const [courses, setCourses] = useState([]);
  const [lessons, setLessons] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [targetCourseId, setTargetCourseId] = useState('');
  const [targetLessonId, setTargetLessonId] = useState('');
  const [selected, setSelected] = useState(null);
  const [materialPreview, setMaterialPreview] = useState(null);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [replaceMaterialId, setReplaceMaterialId] = useState(null);
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

  async function chooseFile(target, event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const extension = extensionOf(file.name);
    const type = file.type || (extension === 'pdf' ? 'application/pdf' : extension === 'mp4' ? 'video/mp4' : '');
    if (!isAllowedCourseMaterialType(type) || file.size > MAX_COURSE_MATERIAL_BYTES) {
      setError('Choose a PDF or MP4 file no larger than 50 MB.');
      return;
    }
    if ((extension !== 'pdf' && extension !== 'mp4')) {
      setError('The course material filename must end in .pdf or .mp4.');
      return;
    }
    if ((extension === 'pdf' && type !== 'application/pdf')
      || (extension === 'mp4' && type !== 'video/mp4')) {
      setError('The selected file type does not match its PDF or MP4 extension.');
      return;
    }
    try {
      const bytes = new Uint8Array(await file.slice(0, 512).arrayBuffer());
      if (!matchesCourseMaterialSignature(type, bytes)) {
        setError(type === 'application/pdf'
          ? 'This PDF could not be verified from its file signature.'
          : 'This MP4 could not be verified from its file signature.');
        return;
      }
    } catch {
      setError('The selected course material could not be read.');
      return;
    }
    if (selected?.previewUrl) URL.revokeObjectURL(selected.previewUrl);
    setSelected({ target, file, previewUrl: URL.createObjectURL(file) });
    setError('');
  }

  async function uploadSelected() {
    if (!selected) return;
    const { target, file } = selected;
    const course = courses.find((item) => item.id === target.courseId);
    if (!course) { setError('Course record is unavailable.'); return; }
    setBusy(target.lessonId || target.courseId);
    setUploadPercent(0);
    setError('');
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-150);
    const path = buildCourseMaterialPath(course.id, target.lessonId, crypto.randomUUID(), safeName);
    const supabase = createClient();
    let uploaded = false;
    try {
      await uploadWithProgress(supabase, path, file, setUploadPercent);
      uploaded = true;
      const result = await saveMaterialAction(
        course.id,
        target.lessonId,
        path,
        file.name,
        file.type || (extensionOf(file.name) === 'mp4' ? 'video/mp4' : 'application/pdf'),
        replaceMaterialId,
      );
      if (!result.ok) throw new Error(result.error);
      setToast(result.warning || `Private material saved for ${target.label}.`);
      setSelected(null);
      setReplaceMaterialId(null);
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
      setUploadPercent(0);
    }
  }

  async function previewMaterial(material) {
    setError('');
    try {
      const { data, error: signedUrlError } = await createClient().storage
        .from('course-materials').createSignedUrl(material.storage_path, 300);
      if (signedUrlError) throw signedUrlError;
      if (!data?.signedUrl) throw new Error('Storage did not return a preview link.');
      setMaterialPreview({ material, url: data.signedUrl });
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : 'Unable to preview this material.');
    }
  }

  async function remove() {
    const result = await removeMaterialAction(removing.id);
    setRemoving(null);
    if (!result.ok) setError(result.error);
    else { setToast('Course material removed.'); await refresh(); }
  }

  const targets = courses.flatMap((course) => [
    { courseId: course.id, lessonId: null, label: `${course.title} (whole course)` },
    ...lessons
      .filter((lesson) => lesson.course_id === course.id)
      .map((lesson) => ({ courseId: course.id, lessonId: lesson.id, label: `${course.title} — ${lesson.title}` })),
  ]);
  const selectedCourseLessons = lessons.filter((lesson) => lesson.course_id === targetCourseId);

  return (
    <>
      <PageHeading title="Course Materials" description="Upload multiple PDF or MP4 files to a course or a specific lesson. Students need approved course access to view them." />
      {error && <p className="field-error" role="alert">{error}</p>}
      <section className="admin-panel">
        <div className="panel-heading"><div><h2>Course and lesson materials</h2><p>Files are stored privately and delivered through short-lived signed URLs.</p></div></div>
        {loading ? <p className="admin-empty-inline" role="status">Loading lesson materials…</p> : loadError ? (
          <RetryState message={loadError} onRetry={refresh} loading={loading} />
        ) : courses.length ? (
          <>
            <div className="admin-form material-target-form">
              <label>Course
                <select value={targetCourseId} onChange={(event) => {
                  setTargetCourseId(event.target.value);
                  setTargetLessonId('');
                  setReplaceMaterialId(null);
                }} disabled={Boolean(busy)}>
                  <option value="">Select a course</option>
                  {courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}
                </select>
              </label>
              <label>Attach material to
                <select value={targetLessonId} onChange={(event) => {
                  setTargetLessonId(event.target.value);
                  setReplaceMaterialId(null);
                }} disabled={!targetCourseId || Boolean(busy)}>
                  <option value="">Whole course (not assigned to a lesson)</option>
                  {selectedCourseLessons.map((lesson) => (
                    <option key={lesson.id} value={lesson.id}>{lesson.title}</option>
                  ))}
                </select>
              </label>
              <input
                id="course-material-file-picker"
                className="file-picker-input"
                type="file"
                accept="application/pdf,video/mp4,.pdf,.mp4"
                disabled={!targetCourseId || Boolean(busy)}
                onChange={(event) => chooseFile({
                  courseId: targetCourseId,
                  lessonId: targetLessonId || null,
                  label: targets.find((target) => target.courseId === targetCourseId
                    && target.lessonId === (targetLessonId || null))?.label || 'selected course area',
                }, event)}
                aria-label="Select private course PDF or video material"
              />
              <label
                htmlFor="course-material-file-picker"
                className="text-button file-action-label"
                onClick={() => setReplaceMaterialId(null)}
              >
                Select new material
              </label>
            </div>
            <div className="admin-table-wrap"><table className="admin-table">
              <thead><tr><th>Course</th><th>Area</th><th>File</th><th>Actions</th></tr></thead>
              <tbody>{materials.map((material) => {
                const course = courses.find((item) => item.id === material.course_id);
                const lesson = lessons.find((item) => item.id === material.lesson_id);
                return <tr key={material.id}>
                  <td>{course?.title || 'Unavailable'}</td>
                  <td>{lesson?.title || 'Whole course'}</td>
                  <td>{material.file_name} ({material.mime_type})</td>
                  <td><div className="row-actions">
                    <button type="button" className="text-button" disabled={Boolean(busy)} onClick={() => previewMaterial(material)}>
                      Preview {material.mime_type === 'video/mp4' ? 'video' : 'PDF'}
                    </button>
                    <button type="button" className="text-button" disabled={Boolean(busy)} onClick={() => {
                      setTargetCourseId(material.course_id);
                      setTargetLessonId(material.lesson_id || '');
                      setReplaceMaterialId(material.id);
                      document.getElementById('course-material-file-picker')?.click();
                    }}>Replace {material.mime_type === 'video/mp4' ? 'video' : 'PDF'}</button>
                    <button type="button" className="text-button text-danger" disabled={Boolean(busy)} onClick={() => setRemoving(material)}>
                      Delete {material.mime_type === 'video/mp4' ? 'video' : 'PDF'}
                    </button>
                  </div></td>
                </tr>;
              })}</tbody>
            </table></div>
          </>
        ) : <EmptyState title="No courses yet" description="Add a course before uploading course or lesson materials." />}
        {selected && (
          <div className="material-upload-preview">
            <p><strong>{selected.target.label}</strong> · {selected.file.name} · {(selected.file.size / (1024 * 1024)).toFixed(1)} MB</p>
            {extensionOf(selected.file.name) === 'pdf'
              ? <iframe title={`Preview of ${selected.file.name}`} className="material-document-preview" src={selected.previewUrl} />
              : <video className="material-video-preview" controls preload="metadata" src={selected.previewUrl}>Your browser does not support video playback.</video>}
            {busy && (
              <div className="upload-progress-status" role="status">
                <progress
                  className="upload-progress"
                  aria-label="Course material upload in progress"
                  max="100"
                  value={uploadPercent}
                />
                <span>{uploadPercent}% uploaded</span>
              </div>
            )}
            <button type="button" className="admin-button button-primary" disabled={Boolean(busy)} onClick={uploadSelected}>
              {busy ? 'Uploading…' : 'Upload selected material'}
            </button>
          </div>
        )}
      </section>
      {materialPreview && <FormDialog
        title={`Preview ${materialPreview.material.file_name}`}
        onClose={() => setMaterialPreview(null)}
      >
        <div className="material-upload-preview">
          <p>Private preview link expires after five minutes.</p>
          {materialPreview.material.mime_type === 'video/mp4'
            ? <video className="material-video-preview" controls preload="metadata" src={materialPreview.url}>
              Your browser does not support video playback.
            </video>
            : <iframe title={`Preview of ${materialPreview.material.file_name}`}
              className="material-document-preview" src={materialPreview.url} />}
        </div>
      </FormDialog>}
      {removing && <ConfirmDialog
        title={removing.mime_type === 'video/mp4' ? 'Delete course video?' : 'Delete course material?'}
        description={`Delete the private file “${removing.file_name}”? Learners will no longer be able to open it.`}
        confirmLabel={removing.mime_type === 'video/mp4' ? 'Delete video' : 'Delete PDF'}
        onCancel={() => setRemoving(null)}
        onConfirm={remove}
      />}
      <Toast message={toast} onDismiss={() => setToast('')} />
    </>
  );
}
