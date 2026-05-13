'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Download, CreditCard, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import customerApi from '@/lib/customer-api';
import InvoiceDocument, { type InvoiceData } from '@/components/shared/InvoiceDocument';

interface InvoiceResponse {
  success: boolean;
  data: InvoiceData & {
    order?: {
      task?: { title?: string | null } | null;
      scope_snapshot?: { title?: string; objective?: string } | null;
    } | null;
  };
}

interface OrderResponse {
  success: boolean;
  data: {
    id: string;
    company_order_status?: string | null;
    task?: { title?: string | null } | null;
    scope_snapshot?: { title?: string; objective?: string } | null;
  };
}

// SasResponse interface removed — the document endpoint now streams the
// PDF instead of returning a SAS URL.

export default function InvoicePage() {
  const { id } = useParams<{ id: string }>();

  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(async () => {
    try {
      const [invoiceRes, orderRes] = await Promise.all([
        customerApi.get<InvoiceResponse>(`/api/v1/orders/${id}/company-invoice`),
        customerApi.get<OrderResponse>(`/api/v1/orders/${id}`),
      ]);

      const inv = invoiceRes.data.data;
      const order = orderRes.data.data;

      // Enrich invoice with order context for display
      setInvoice({
        ...inv,
        order: {
          task: order.task ?? null,
          scope_snapshot: order.scope_snapshot ?? null,
        },
      });
    } catch (err) {
      const e = err as { response?: { status?: number } };
      if (e.response?.status === 404) {
        setNotFound(true);
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  async function handleDownload() {
    if (!invoice) return;
    setDownloading(true);
    try {
      // Stream the PDF blob through the API and open via a local Object
      // URL — replaces the prior SAS-URL flow which exposed Azure URLs
      // to the browser. See lib/download.ts for the rationale.
      const res = await customerApi.get(
        `/api/v1/company-invoices/${invoice.id}/document`,
        { responseType: 'blob' },
      );
      const url = URL.createObjectURL(res.data as Blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      setTimeout(() => { URL.revokeObjectURL(url); }, 60_000);
    } catch {
      toast.error('Could not retrieve PDF. Please try again.');
    } finally {
      setDownloading(false);
    }
  }

  function handlePrint() {
    window.print();
  }

  const canPay = invoice?.status === 'SENT' || invoice?.status === 'OVERDUE';

  return (
    <>
      {/* Print styles — hide chrome when printing */}
      <style>{`
        @media print {
          .invoice-chrome { display: none !important; }
          body { background: #fff !important; }
        }
      `}</style>

      {/* ── Toolbar (hidden on print) ── */}
      <div className="invoice-chrome bg-slate-950 border-b border-slate-800 sticky top-0 z-20 print:hidden">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link
            href={`/customer/orders/${id}`}
            className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors no-underline mr-2"
          >
            <ArrowLeft size={14} />
            Back to Order
          </Link>

          <div className="flex-1" />

          <Button
            variant="secondary"
            size="sm"
            onClick={handlePrint}
          >
            <Printer size={14} className="mr-1.5" />
            Print
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => { void handleDownload(); }}
            loading={downloading}
            disabled={!invoice?.pdf_blob_path}
          >
            <Download size={14} className="mr-1.5" />
            Download PDF
          </Button>

          {canPay && (
            <Button asChild size="sm">
              <Link href={`/customer/orders/${id}/invoice/payment`}>
                <CreditCard size={14} className="mr-1.5" />
                Pay Invoice
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="invoice-chrome min-h-screen bg-slate-950 py-8 px-4 print:bg-white print:p-0">
        <div className="max-w-4xl mx-auto">
          {loading && (
            <div className="bg-white rounded-2xl shadow-xl p-12 space-y-6">
              <div className="flex justify-between">
                <div className="h-6 w-32 bg-slate-100 rounded animate-pulse" />
                <div className="h-6 w-24 bg-slate-100 rounded animate-pulse" />
              </div>
              <div className="h-px bg-slate-200" />
              <div className="grid grid-cols-2 gap-8">
                <div className="space-y-2">
                  <div className="h-3 w-20 bg-slate-100 rounded animate-pulse" />
                  <div className="h-5 w-40 bg-slate-100 rounded animate-pulse" />
                  <div className="h-4 w-32 bg-slate-100 rounded animate-pulse" />
                </div>
                <div className="space-y-2">
                  <div className="h-3 w-20 bg-slate-100 rounded animate-pulse" />
                  <div className="h-5 w-40 bg-slate-100 rounded animate-pulse" />
                </div>
              </div>
              <div className="h-24 bg-slate-50 rounded-lg animate-pulse" />
              <div className="h-40 bg-slate-50 rounded-lg animate-pulse" />
            </div>
          )}

          {!loading && notFound && (
            <div className="bg-white rounded-2xl shadow-xl p-12 text-center">
              <p className="text-slate-500 text-sm mb-4">
                No invoice has been issued for this order yet.
              </p>
              <Button asChild variant="secondary" size="sm">
                <Link href={`/customer/orders/${id}`}>Back to Order</Link>
              </Button>
            </div>
          )}

          {!loading && invoice && (
            <div className="bg-white rounded-2xl shadow-xl overflow-hidden print:shadow-none print:rounded-none">
              <InvoiceDocument invoice={invoice} />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
