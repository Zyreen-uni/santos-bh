import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { AppShell } from '@/components/layout/AppShell';
import { ADMIN_MENU, TENANT_MENU } from '@/components/layout/menus';
import { RequireRole } from '@/components/RequireRole';
import LoginPage from '@/pages/LoginPage';
import RegisterPage from '@/pages/RegisterPage';
import MenuPage from '@/pages/MenuPage';
import AdminDashboard from '@/pages/admin/AdminDashboard';
import TenantDashboard from '@/pages/tenant/TenantDashboard';
import RoomsPage from '@/pages/admin/RoomsPage';
import TenantsPage from '@/pages/admin/TenantsPage';
import SettingsPage from '@/pages/admin/SettingsPage';
import UtilityBillingPage from '@/pages/UtilityBillingPage';
import PaymentsPage from '@/pages/admin/PaymentsPage';
import ConcernsPage from '@/pages/admin/ConcernsPage';
import AnnouncementsPage from '@/pages/admin/AnnouncementsPage';
import MyProfilePage from '@/pages/tenant/MyProfilePage';
import MyPaymentsPage from '@/pages/tenant/MyPaymentsPage';
import MyConcernsPage from '@/pages/tenant/MyConcernsPage';

// Pages with their own component. Menu items not listed here use MenuPage until their module.
const ADMIN_PAGES: Record<string, ReactNode> = {
  '/admin/rooms': <RoomsPage />,
  '/admin/tenants': <TenantsPage />,
  '/admin/settings': <SettingsPage />,
  '/admin/utility-billing': <UtilityBillingPage />,
  '/admin/payments': <PaymentsPage />,
  '/admin/concerns': <ConcernsPage />,
  '/admin/announcements': <AnnouncementsPage />,
};
const TENANT_PAGES: Record<string, ReactNode> = {
  '/tenant/utility-billing': <UtilityBillingPage />,
  '/tenant/profile': <MyProfilePage section="profile" />,
  '/tenant/room': <MyProfilePage section="room" />,
  '/tenant/payments': <MyPaymentsPage />,
  '/tenant/concerns': <MyConcernsPage />,
  '/tenant/announcements': <MyConcernsPage />,
};

// The app opens on Login (no landing page). Role decides /admin or /tenant.
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        path="/admin"
        element={
          <RequireRole role="admin">
            <AppShell role="admin" />
          </RequireRole>
        }
      >
        <Route index element={<AdminDashboard />} />
        {ADMIN_MENU.slice(1).map((m) => (
          <Route key={m.to} path={m.to.slice('/admin/'.length)} element={ADMIN_PAGES[m.to] ?? <MenuPage />} />
        ))}
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Route>
      <Route
        path="/tenant"
        element={
          <RequireRole role="tenant">
            <AppShell role="tenant" />
          </RequireRole>
        }
      >
        <Route index element={<TenantDashboard />} />
        {TENANT_MENU.slice(1).map((m) => (
          <Route key={m.to} path={m.to.slice('/tenant/'.length)} element={TENANT_PAGES[m.to] ?? <MenuPage />} />
        ))}
        <Route path="*" element={<Navigate to="/tenant" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
