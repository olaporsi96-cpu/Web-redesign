'use client';

import Link from 'next/link';
import { useAdmin } from '../admin-provider';
import { PageHeading } from '../_components/admin-ui';

export default function AdminDashboardPage() {
  const { adminProfile, canAdmin } = useAdmin();
  const actions = [
    ...(canAdmin('view_students') || canAdmin('manage_student_records')
      ? [{ href: '/admin/students', label: 'Students' }]
      : []),
    ...(canAdmin('manage_results') ? [{ href: '/admin/results', label: 'Results' }] : []),
    ...(canAdmin('manage_courses') ? [{ href: '/admin/courses', label: 'Courses' }] : []),
    ...(canAdmin('manage_lessons') || canAdmin('publish_unpublish_lessons')
      ? [{ href: '/admin/lessons', label: 'Lessons' }]
      : []),
    ...(canAdmin('manage_course_materials') ? [{ href: '/admin/materials', label: 'Course materials' }] : []),
    ...(canAdmin('view_orders_payments') ? [{ href: '/admin/orders', label: 'Orders and payments' }] : []),
    ...(canAdmin('manage_catalogue_settings') ? [{ href: '/admin/settings', label: 'Catalogue and bank settings' }] : []),
    ...(adminProfile.role === 'main_admin' ? [{ href: '/admin/media', label: 'E-Learning feature video' }] : []),
    ...(adminProfile.role === 'main_admin' ? [{ href: '/admin/calendar', label: 'School calendar' }] : []),
    ...(adminProfile.role === 'main_admin' ? [{ href: '/admin/users', label: 'Sub-Admin accounts' }] : []),
  ];

  return (
    <>
      <PageHeading
        eyebrow="Overview"
        title="Dashboard"
        description={`Welcome, ${adminProfile.displayName}. Choose an authorized workspace section.`}
      />
      <section className="quick-actions-panel">
        <div>
          <span className="admin-eyebrow">WORKSPACE</span>
          <h2>Manage college records</h2>
          <p>Records and summaries appear only after they have been added to the system.</p>
        </div>
        <div className="quick-action-buttons">
          {actions.length ? actions.map((action) => (
            <Link key={action.href} className="admin-button button-primary" href={action.href}>{action.label}</Link>
          )) : <p className="no-admin-actions">No dashboard sections are assigned to this account.</p>}
        </div>
      </section>
    </>
  );
}
