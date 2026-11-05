'use client';

import { useState } from 'react';
import { FormDialog } from './admin-ui';

export const courseCategories = [
  'JSS', 'SSS Commercial', 'SSS Science', 'SSS Arts', 'Standardized Tests',
];

export default function CourseForm({ course, onSave, onClose, canPublish = true }) {
  const [form, setForm] = useState(course || {
    title: '', category: courseCategories[0], description: '', price: '', status: 'draft',
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
        description: form.description.trim(),
        price: Number(form.price),
        status: canPublish ? form.status : course?.status || 'draft',
      });
      if (!result?.ok) {
        setError(result?.error || 'The course could not be saved.');
        return;
      }
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'The course could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormDialog title={course ? 'Edit course' : 'Add course'} onClose={onClose}>
      <form className="admin-form" onSubmit={submit}>
        <label>
          Course title
          <input required maxLength={100} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
        </label>
        <label>
          Category
          <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
            {courseCategories.map((category) => <option key={category}>{category}</option>)}
          </select>
        </label>
        <label>
          Course price (NGN)
          <input required type="number" min="0" step="0.01" value={form.price ?? ''} onChange={(event) => setForm({ ...form, price: event.target.value })} />
        </label>
        <label>
          Description
          <textarea rows={4} maxLength={500} value={form.description || ''} onChange={(event) => setForm({ ...form, description: event.target.value })} />
        </label>
        {canPublish ? (
          <label>
            Status
            <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
          </label>
        ) : <p className="field-hint">Publishing permission is required to change this course&apos;s status.</p>}
        {error && <p className="field-error" role="alert">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="admin-button button-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="admin-button button-primary" disabled={saving}>{saving ? 'Saving…' : course ? 'Save changes' : 'Add course'}</button>
        </div>
      </form>
    </FormDialog>
  );
}
