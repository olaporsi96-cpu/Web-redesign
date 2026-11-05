import SubAdminLoginPortal from '../../sub-admin-login-portal';
import accountArchiving from '../../../../utils/account-archiving.cjs';

export default function SubAdminLoginPage() {
  return <SubAdminLoginPortal archivingEnabled={accountArchiving.isAccountArchivingEnabled()} />;
}
