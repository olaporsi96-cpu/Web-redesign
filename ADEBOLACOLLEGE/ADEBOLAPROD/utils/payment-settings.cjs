function buildPaymentSettingsRpcArgs(payments) {
  if (!payments || typeof payments !== 'object' || Array.isArray(payments)) {
    throw new TypeError('Bank-transfer settings must be an object.');
  }

  const fields = [
    ['bankName', 'configured_bank'],
    ['accountName', 'configured_account_name'],
    ['accountNumber', 'configured_account_number'],
    ['accountType', 'configured_account_type'],
  ];
  const args = {};
  for (const [source, target] of fields) {
    const value = payments[source];
    if (typeof value !== 'string') {
      throw new TypeError(`Bank-transfer setting ${source} must be text.`);
    }
    args[target] = value.trim() || null;
  }
  return args;
}

module.exports = { buildPaymentSettingsRpcArgs };
