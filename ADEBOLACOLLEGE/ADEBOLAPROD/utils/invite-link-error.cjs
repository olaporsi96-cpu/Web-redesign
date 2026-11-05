function invitationLinkErrorMessage(code) {
  if (code === 'activation-unavailable') {
    return 'Account activation is temporarily unavailable. Ask the Main Admin to check the TEST invitation configuration before requesting a new link.';
  }
  if (code === 'invalid-invite' || code === 'invite-verification') {
    return 'This invitation link is invalid, expired, or has already been used. Ask the Main Admin to check the pending account and email-provider configuration before requesting another link.';
  }
  return '';
}

module.exports = { invitationLinkErrorMessage };
