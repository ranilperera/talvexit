'use client';
import { useEffect } from 'react';
import { useParams } from 'next/navigation';

// Redirect /customer/orders/[id]/payment → /customer/orders/[id]/invoice/payment
export default function PaymentRedirect() {
  const params = useParams();
  const id = params.id as string;

  useEffect(() => {
    window.location.replace(`/customer/orders/${id}/invoice/payment`);
  }, [id]);

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
