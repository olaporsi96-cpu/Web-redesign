'use client';

import { useEffect, useMemo, useState } from 'react';
import { ConfirmDialog, EmptyState, PageHeading, RetryState, StatusBadge, Toast } from '../../_components/admin-ui';
import LessonForm from '../../_components/lesson-form';
import {
  archiveLessonAction,
  loadCourseAdminData,
  saveLessonAction,
  setLessonStatusAction,
} from '../catalogue-actions';

export default function LessonsPage() {
  const [courses, setCourses] = useState([]);
  const [lessons, setLessons] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [courseFilter, setCourseFilter] = useState('all');
  const [editing, setEditing] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const [toast, setToast] = useState('');
  const canManage = permissions.includes('manage_lessons');
  const canPublish = permissions.includes('publish_unpublish_lessons');

  async function refresh() {
    setLoading(true);
    setError('');
    try {
      const result = await loadCourseAdminData();
      if (!result.ok) setError(result.error);
      else {
        setCourses(result.data.courses || []);
        setLessons(result.data.lessons || []);
        setPermissions(result.data.permissions || []);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load lessons.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { refresh(); }, []);
  useEffect(() => {
    if (canManage && new URLSearchParams(window.location.search).get('new') === '1') {
      window.history.replaceState({}, '', window.location.pathname);
      setTimeout(() => setEditing({ isNew: true }), 0);
    }
  }, [canManage]);

  const filtered = useMemo(() => lessons.filter((lesson) => {
    const course = courses.find((item) => item.id === lesson.course_id);
    const matchesText = `${lesson.title} ${lesson.lesson_code || ''} ${course?.title || ''}`.toLowerCase().includes(query.toLowerCase());
    return matchesText && (courseFilter === 'all' || lesson.course_id === courseFilter);
  }), [lessons, courses, query, courseFilter]);
  async function save(lesson) {
    const result = await saveLessonAction(lesson);
    if (result.ok) {
      await refresh();
      setToast(lesson.id ? 'Lesson changes saved.' : 'Lesson added.');
    }
    return result;
  }
  async function archive() {
    const result = await archiveLessonAction(confirming.id);
    setConfirming(null);
    if (result.ok) { await refresh(); setToast('Lesson archived.'); }
    else setError(result.error);
  }

  return (
    <>
      <div className="page-heading-row">
        <PageHeading title="Lessons" description="Manage lesson records. New codes are generated from each course category's configured range when left blank." />
        {canManage && (
          <button type="button" className="admin-button button-primary" disabled={!courses.some((course) => course.status !== 'archived')} onClick={() => setEditing({ isNew: true })}>＋ Add lesson</button>
        )}
      </div>
      <section className="admin-panel">
        {loading ? <p className="admin-empty-inline" role="status">Loading lessons…</p> : error ? (
          <RetryState message={error} onRetry={refresh} loading={loading} />
        ) : (
          <>
        <div className="filter-toolbar">
          <label className="search-field"><span className="sr-only">Search lessons</span><span aria-hidden="true">⌕</span>
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search lessons or codes..." />
          </label>
          <label className="filter-select"><span>Course</span>
            <select value={courseFilter} onChange={(event) => setCourseFilter(event.target.value)}>
              <option value="all">All courses</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}
            </select>
          </label>
          <span className="result-count">{filtered.length} {filtered.length === 1 ? 'lesson' : 'lessons'}</span>
        </div>
        {filtered.length ? (
          <div className="admin-table-wrap"><table className="admin-table">
            <thead><tr><th>Lesson</th><th>Course</th><th>Code</th><th>Status</th><th>Updated</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{filtered.map((lesson) => (
              <tr key={lesson.id}>
                <td><strong>{lesson.title}</strong></td>
                <td>{courses.find((item) => item.id === lesson.course_id)?.title || 'Unavailable'}</td>
                <td>{lesson.lesson_code || '—'}</td><td><StatusBadge status={lesson.status} /></td>
                <td>{lesson.updated_at ? new Date(lesson.updated_at).toLocaleDateString() : '—'}</td>
                <td><div className="row-actions">
                  {canManage && <button type="button" className="text-button" onClick={() => setEditing(lesson)}>Edit</button>}
                  {canPublish && lesson.status !== 'archived' && <button type="button" className="text-button" onClick={async () => {
                    const result = await setLessonStatusAction(lesson.id, lesson.status === 'published' ? 'draft' : 'published');
                    if (result.ok) { await refresh(); setToast(lesson.status === 'published' ? 'Lesson unpublished.' : 'Lesson published.'); }
                    else setError(result.error);
                  }}>{lesson.status === 'published' ? 'Unpublish' : 'Publish'}</button>}
                  {canManage && lesson.status !== 'archived' && (lesson.status !== 'published' || canPublish) && <button type="button" className="text-button text-danger" onClick={() => setConfirming(lesson)}>Archive</button>}
                </div></td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : (
          <EmptyState
            title={lessons.length ? 'No matching lessons' : 'No lessons have been added yet'}
            description={lessons.length
              ? 'Try another search or course filter.'
              : 'Create a course first, then add its lesson records and codes.'}
          />
        )}
          </>
        )}
      </section>
      {editing && <LessonForm lesson={editing.isNew ? null : editing} courses={courses} canPublish={canPublish} onSave={save} onClose={() => setEditing(null)} />}
      {confirming && <ConfirmDialog title="Archive this lesson?" description={`“${confirming.title}” will no longer be offered.`} confirmLabel="Archive lesson" onCancel={() => setConfirming(null)} onConfirm={archive} />}
      <Toast message={toast} onDismiss={() => setToast('')} />
    </>
  );
}
