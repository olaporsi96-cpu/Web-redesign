'use client';

import { createContext, useContext, useMemo } from 'react';

export const ADMIN_PERMISSION_DEFINITIONS = [
  { key: 'view_dashboard', label: 'View dashboard' },
  { key: 'manage_courses', label: 'Manage courses' },
  { key: 'manage_lessons', label: 'Manage lessons' },
  { key: 'manage_courses_lessons', label: 'Manage courses and lessons' },
  { key: 'publish_unpublish_lessons', label: 'Publish or unpublish lessons' },
  { key: 'manage_course_materials', label: 'Manage course materials' },
  { key: 'view_students', label: 'View students' },
  { key: 'manage_student_records', label: 'Manage student records' },
  { key: 'view_orders_payments', label: 'View and manage orders and payments' },
  { key: 'manage_results', label: 'Create and update student results' },
  { key: 'release_results', label: 'Release student results' },
  { key: 'manage_admin_users', label: 'Manage Sub-Admin profiles (Main Admin only)', mainAdminOnly: true },
  { key: 'manage_catalogue_settings', label: 'Manage catalogue settings' },
];

const AdminContext = createContext(null);

export function AdminProvider({ children, initialProfile }) {
  const adminProfile = useMemo(() => ({
    id: initialProfile.id,
    displayName: initialProfile.display_name,
    email: initialProfile.email,
    role: initialProfile.role,
    adminEnabled: initialProfile.admin_enabled === true,
    permissions: initialProfile.role === 'main_admin'
      ? ADMIN_PERMISSION_DEFINITIONS.map(({ key }) => key)
      : initialProfile.permissions || [],
  }), [initialProfile]);

  const value = useMemo(() => ({
    adminProfile,
    canAdmin(permission) {
      if (!adminProfile.adminEnabled) return false;
      if (adminProfile.role === 'main_admin') return true;
      if (adminProfile.permissions.includes(permission)) return true;
      if (permission === 'manage_courses') {
        return adminProfile.permissions.includes('manage_courses_lessons');
      }
      if (permission === 'manage_lessons') {
        return adminProfile.permissions.includes('manage_courses_lessons');
      }
      return false;
    },
  }), [adminProfile]);

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdmin() {
  const context = useContext(AdminContext);
  if (!context) throw new Error('useAdmin must be used within AdminProvider.');
  return context;
}
