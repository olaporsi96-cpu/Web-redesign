'use client';

import { useWebsiteSettings } from './website-settings-context';

export default function ContactEmailLink({ type = 'contact', children, ...props }) {
  const settings = useWebsiteSettings();
  const email = type === 'elearning' ? settings?.elearningEmail : settings?.contactEmail;
  if (!email) return null;
  return <a {...props} href={`mailto:${email}`}>{children || email}</a>;
}
