'use client';

import { useState } from 'react';
import { FormDialog } from './admin-ui';

export default function LessonForm({ lesson, courses, onSave, onClose, canPublish = true }) {
  const [form, setForm] = useState(lesson ? {
    ...lesson, courseId: lesson.course_id, code: lesson.lesson_code || '',
  } : {
    title: '', courseId: courses[0]?.id || '', code: '', status: 'draft',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const result = await onSave({
        ...form,
        title: form.title.trim(),
        code: form.code.trim(),
        status: canPublish ? form.status : lesson?.status || 'draft',
      });
      if (!result?.ok) {
        setError(result?.error || 'The lesson could not be saved.');
        return;
      }
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'The lesson could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormDialog title={lesson ? 'Edit lesson' : 'Add lesson'} onClose={onClose}>
      <form className="admin-form" onSubmit={submit}>
        <label>
          Course
          <select required value={form.courseId} onChange={(event) => setForm({ ...form, courseId: event.target.value })}>
            {courses.filter((course) => course.status !== 'archived').map((course) => (
              <option key={course.id} value={course.id}>{course.title} · {course.category}</option>
            ))}
          </select>
        </label>
        <label>
          Lesson title
          <input required maxLength={100} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
        </label>
        <label>
          Lesson code
          <input maxLength={40} value={form.code || ''} onChange={(event) => setForm({ ...form, code: event.target.value })} placeholder={lesson ? 'Optional' : 'Auto-generated when blank'} />
        </label>
        {!lesson && <p className="field-hint">Leave blank to assign the next available code from this course category&apos;s configured range.</p>}
        {canPublish ? (
          <label>Status
            <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
              <option value="draft">Draft</option><option value="published">Published</option>
            </select>
          </label>
        ) : <p className="field-hint">Publishing permission is required to change this lesson&apos;s status.</p>}
        {error && <p className="field-error" role="alert">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="admin-button button-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="admin-button button-primary" disabled={saving || !courses.length}>{saving ? 'Saving…' : lesson ? 'Save changes' : 'Add lesson'}</button>
        </div>
      </form>
    </FormDialog>
  );
}
