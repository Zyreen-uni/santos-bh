import { useLocation } from 'react-router';
import { PageHeader } from '@/components/layout/PageHeader';
import { ADMIN_MENU, TENANT_MENU, activeItem } from '@/components/layout/menus';

// A menu page whose module is not built yet shows its header, so the shell and guards can be used
// end to end. Each module replaces its route with the real page.
export default function MenuPage() {
  const { pathname } = useLocation();
  const item = activeItem(pathname.startsWith('/admin') ? ADMIN_MENU : TENANT_MENU, pathname);
  return <PageHeader title={item?.label ?? ''} />;
}
