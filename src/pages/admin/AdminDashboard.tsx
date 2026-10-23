import { PageHeader, longDate } from '@/components/layout/PageHeader';

// Admin Dashboard (flowchart page 2, design Admin-A). The counts and cards come in M9.
export default function AdminDashboard() {
  return <PageHeader title="Dashboard" subtitle={longDate()} />;
}
