function createInvitationRedirect(siteUrl, path) {
  if (typeof siteUrl !== 'string' || !siteUrl.trim()) {
    throw new Error('NEXT_PUBLIC_SITE_URL must be set to the current application origin.');
  }

  let origin;
  try {
    origin = new URL(siteUrl);
  } catch {
    throw new Error('NEXT_PUBLIC_SITE_URL must be a valid application origin.');
  }

  const isLoopback = ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
  if (
    !['http:', 'https:'].includes(origin.protocol)
    || (origin.protocol !== 'https:' && !isLoopback)
    || origin.username
    || origin.password
    || origin.pathname !== '/'
    || origin.search
    || origin.hash
  ) {
    throw new Error('NEXT_PUBLIC_SITE_URL must be a secure origin (HTTP is allowed only for localhost testing).');
  }

  return new URL(path, origin.origin).toString();
}

module.exports = { createInvitationRedirect };
