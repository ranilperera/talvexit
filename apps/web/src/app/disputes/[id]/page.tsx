'use client';
import { useEffect } from 'react';
import { useParams } from 'next/navigation';

// Legacy redirect: /disputes/[id] → /customer/disputes/[id]
export default function DisputeRedirect() {
  const params = useParams();
  const id = params.id as string;

  useEffect(() => {
    window.location.replace(`/customer/disputes/${id}`);
  }, [id]);

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
