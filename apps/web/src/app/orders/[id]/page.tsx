'use client';
import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { getUser } from '@/lib/customer-auth';

// Legacy redirect: /orders/[id] → role-specific path
export default function OrderDetailRedirect() {
  const params = useParams();
  const id = params.id as string;

  useEffect(() => {
    const user = getUser();
    if (!user) {
      window.location.replace(`/login?returnUrl=/customer/orders/${id}`);
      return;
    }

    const roleMap: Record<string, string> = {
      CUSTOMER:               `/customer/orders/${id}`,
      INDIVIDUAL_CONTRACTOR:  `/contractor/orders/${id}`,
      ORGANISATION_ADMIN:     `/contractor/orders/${id}`,
      ORG_MEMBER:             `/contractor/orders/${id}`,
      COMPANY_ADMIN:          `/company/orders/${id}`,
      COMPANY_MEMBER:         `/company/orders/${id}`,
    };

    window.location.replace(roleMap[user.account_type] ?? `/customer/orders/${id}`);
  }, [id]);

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
