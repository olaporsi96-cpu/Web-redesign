function formatSupabaseError(error, operation) {
  if (!error) return `${operation} failed for an unknown reason.`;
  if (error instanceof Error) return `${operation}: ${error.message}`;

  const parts = [];
  if (typeof error.message === 'string' && error.message) parts.push(error.message);
  if (typeof error.code === 'string' && error.code) parts.push(`code ${error.code}`);
  if (typeof error.details === 'string' && error.details) parts.push(error.details);
  if (typeof error.hint === 'string' && error.hint) parts.push(`Hint: ${error.hint}`);
  return parts.length ? `${operation}: ${parts.join(' — ')}` : `${operation} failed for an unknown reason.`;
}

module.exports = { formatSupabaseError };
