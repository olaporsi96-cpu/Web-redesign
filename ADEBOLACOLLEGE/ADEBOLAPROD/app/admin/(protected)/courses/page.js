'use client';

import { useEffect, useMemo, useState } from 'react';
import { ConfirmDialog, EmptyState, PageHeading, RetryState, StatusBadge, Toast } from '../../_components/admin-ui';
import CourseForm from '../../_components/course-form';
import { archiveCourseAction, loadCourseAdminData, saveCourseAction } from '../catalogue-actions';

function displayDate(value) {
  return value ? new Date(value).toLocaleDateString() : '—';
}

export default function CoursesPage() {
  const [courses, setCourses] = useState([]);
  const [lessons, setLessons] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [editing, setEditing] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const [toast, setToast] = useState('');

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
      setError(loadError instanceof Error ? loadError.message : 'Unable to load courses.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { refresh(); }, []);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('new') === '1') {
      setEditing(null);
      window.history.replaceState({}, '', window.location.pathname);
      setTimeout(() => setEditing({ isNew: true }), 0);
    }
  }, []);

  const filtered = useMemo(() => courses.filter((course) => {
    const matchesText = `${course.title} ${course.category} ${course.description}`.toLowerCase().includes(query.toLowerCase());
    return matchesText && (statusFilter === 'all' || course.status === statusFilter);
  }), [courses, query, statusFilter]);
  const canPublish = permissions.includes('publish_unpublish_lessons');

  async function save(course) {
    const result = await saveCourseAction(course);
    if (result.ok) {
      await refresh();
      setToast(course.id ? 'Course changes saved.' : 'Course added.');
    }
    return result;
  }

  async function archive() {
    const result = await archiveCourseAction(confirming.id);
    setConfirming(null);
    if (result.ok) {
      await refresh();
      setToast('Course archived.');
    } else setError(result.error);
  }

  return (
    <>
      <div className="page-heading-row">
        <PageHeading title="Courses" description="Create courses, set their actual prices, and manage publication." />
        <button type="button" className="admin-button button-primary" onClick={() => setEditing({ isNew: true })}>＋ Add course</button>
      </div>
      <section className="admin-panel">
        {loading ? <p className="admin-empty-inline" role="status">Loading courses…</p> : error ? (
          <RetryState message={error} onRetry={refresh} loading={loading} />
        ) : (
          <>
        <div className="filter-toolbar">
          <label className="search-field"><span className="sr-only">Search courses</span><span aria-hidden="true">⌕</span>
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search courses..." />
          </label>
          <label className="filter-select"><span>Status</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">All statuses</option><option value="published">Published</option>
              <option value="draft">Draft</option><option value="archived">Archived</option>
            </select>
          </label>
          <span className="result-count">{filtered.length} {filtered.length === 1 ? 'course' : 'courses'}</span>
        </div>
        {filtered.length ? (
          <div className="admin-table-wrap"><table className="admin-table">
            <thead><tr><th>Course</th><th>Category</th><th>Price (NGN)</th><th>Lessons</th><th>Status</th><th>Updated</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{filtered.map((course) => (
              <tr key={course.id}>
                <td><strong>{course.title}</strong></td><td>{course.category}</td>
                <td>{Number(course.price).toLocaleString('en-NG')}</td>
                <td>{lessons.filter((lesson) => lesson.course_id === course.id && lesson.status !== 'archived').length}</td>
                <td><StatusBadge status={course.status} /></td><td>{displayDate(course.updated_at)}</td>
                <td><div className="row-actions">
                  <button type="button" className="text-button" onClick={() => setEditing(course)}>Edit</button>
                  {canPublish && course.status !== 'archived' && <button type="button" className="text-button" onClick={async () => {
                    const result = await saveCourseAction({ ...course, status: course.status === 'published' ? 'draft' : 'published' });
                    if (result.ok) { await refresh(); setToast(course.status === 'published' ? 'Course unpublished.' : 'Course published.'); }
                    else setError(result.error);
                  }}>{course.status === 'published' ? 'Unpublish' : 'Publish'}</button>}
                  {course.status !== 'archived' && <button type="button" className="text-button text-danger" onClick={() => setConfirming(course)}>Archive</button>}
                </div></td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : (
          <EmptyState
            title={courses.length ? 'No matching courses' : 'No courses have been added yet'}
            description={courses.length ? 'Try another search or status filter.' : 'Add a course to start building the catalogue.'}
          />
        )}
          </>
        )}
      </section>
      {editing && <CourseForm course={editing.isNew ? null : editing} canPublish={canPublish} onSave={save} onClose={() => setEditing(null)} />}
      {confirming && <ConfirmDialog title="Archive this course?" description={`“${confirming.title}” will no longer be offered in the catalogue.`} confirmLabel="Archive course" onCancel={() => setConfirming(null)} onConfirm={archive} />}
      <Toast message={toast} onDismiss={() => setToast('')} />
    </>
  );
}
