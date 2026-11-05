function isAccountArchivingEnabled() {
  return process.env.SUB_ADMIN_ARCHIVING_ENABLED === 'true';
}

function profileSelectColumns(columns) {
  return isAccountArchivingEnabled()
    ? `${columns}, sub_admin_archived_at`
    : columns;
}

module.exports = { isAccountArchivingEnabled, profileSelectColumns };
