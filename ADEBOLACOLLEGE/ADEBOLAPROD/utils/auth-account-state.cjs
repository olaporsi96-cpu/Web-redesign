function getAccountEmailAction(user) {
  if (!user || typeof user.id !== 'string') return 'unavailable';
  if (user.email_confirmed_at) return 'password-recovery';
  if (user.invited_at) return 'pending-invitation';
  return 'unconfirmed';
}

module.exports = { getAccountEmailAction };
