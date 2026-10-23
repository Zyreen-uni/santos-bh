import { PageHeader, longDate } from '@/components/layout/PageHeader';
import { useAuth } from '@/lib/auth';

// Tenant Dashboard (flowchart page 10, design Ten-A). The bill card and tiles come in M10.
export default function TenantDashboard() {
  const { account } = useAuth();
  const first = account?.fullName.split(' ')[0] ?? '';
  return (
    <PageHeader
      title={`Hi, ${first}`}
      subtitle={longDate()}
      aside={
        account?.isManager ? (
          <span className="rounded-full bg-warn-bg px-3.5 py-2 text-[13px] font-bold text-warn">Tenant Manager</span>
        ) : undefined
      }
    />
  );
}
