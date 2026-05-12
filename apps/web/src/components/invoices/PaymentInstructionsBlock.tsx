'use client';

import { Building2, Globe2, Mail, Send, CreditCard, Info } from 'lucide-react';

// Renders a provider's payment instructions for an invoice. Accepts the raw
// payment_methods JSON returned from /service-invoices/:id (full unmasked) or
// the masked PaymentMethodsPublicView shape returned from /providers/:id/...

interface PaymentMethodsRaw {
  stripe?: { enabled?: boolean };
  bank_au?: {
    enabled?: boolean;
    bsb?: string;
    account_number?: string;
    account_name?: string;
  };
  bank_swift?: {
    enabled?: boolean;
    bank_name?: string;
    swift_code?: string;
    iban?: string;
    account_number?: string;
    account_name?: string;
    bank_address?: string;
  };
  paypal?: { enabled?: boolean; email?: string; email_masked?: string };
  wise?: {
    enabled?: boolean;
    email?: string;
    email_masked?: string;
    currency?: string;
  };
  other?: { enabled?: boolean; description?: string };
}

interface Props {
  methods: PaymentMethodsRaw;
  /** When true, hides "Pay with card" since Stripe doesn't fit the bank-instructions list */
  hideStripe?: boolean;
}

export default function PaymentInstructionsBlock({ methods, hideStripe }: Props) {
  const sections: { icon: React.ElementType; title: string; rows: [string, string][] }[] = [];

  if (methods.bank_au?.enabled) {
    const rows: [string, string][] = [];
    if (methods.bank_au.account_name)
      rows.push(['Account name', methods.bank_au.account_name]);
    if (methods.bank_au.bsb) rows.push(['BSB', methods.bank_au.bsb]);
    if (methods.bank_au.account_number)
      rows.push(['Account #', methods.bank_au.account_number]);
    if (rows.length > 0)
      sections.push({ icon: Building2, title: 'Bank Transfer (Australia)', rows });
  }

  if (methods.bank_swift?.enabled) {
    const rows: [string, string][] = [];
    if (methods.bank_swift.bank_name)
      rows.push(['Bank', methods.bank_swift.bank_name]);
    if (methods.bank_swift.swift_code)
      rows.push(['SWIFT/BIC', methods.bank_swift.swift_code]);
    if (methods.bank_swift.iban) rows.push(['IBAN', methods.bank_swift.iban]);
    if (methods.bank_swift.account_number)
      rows.push(['Account #', methods.bank_swift.account_number]);
    if (methods.bank_swift.account_name)
      rows.push(['Account name', methods.bank_swift.account_name]);
    if (methods.bank_swift.bank_address)
      rows.push(['Bank address', methods.bank_swift.bank_address]);
    if (rows.length > 0)
      sections.push({ icon: Globe2, title: 'International Wire (SWIFT)', rows });
  }

  if (methods.paypal?.enabled) {
    const email = methods.paypal.email ?? methods.paypal.email_masked;
    if (email) sections.push({ icon: Mail, title: 'PayPal', rows: [['Email', email]] });
  }

  if (methods.wise?.enabled) {
    const email = methods.wise.email ?? methods.wise.email_masked;
    if (email) {
      const rows: [string, string][] = [['Email', email]];
      if (methods.wise.currency) rows.push(['Currency', methods.wise.currency]);
      sections.push({ icon: Send, title: 'Wise', rows });
    }
  }

  if (methods.other?.enabled && methods.other.description) {
    sections.push({
      icon: Info,
      title: 'Other',
      rows: [['Instructions', methods.other.description]],
    });
  }

  const hasStripe = !hideStripe && methods.stripe?.enabled;

  if (sections.length === 0 && !hasStripe) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 text-sm text-slate-500 text-center">
        The provider has not configured payment instructions yet — contact them
        directly.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-800">
        <h3 className="text-sm font-semibold text-slate-200">Payment instructions</h3>
        <p className="mt-0.5 text-xs text-slate-500">
          The provider accepts the methods below. Pay using whichever is most
          convenient.
        </p>
      </div>
      <div className="divide-y divide-slate-800/60">
        {sections.map((s, i) => (
          <div key={i} className="px-5 py-4">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-200">
              <s.icon size={14} className="text-teal-400" />
              {s.title}
            </div>
            <dl className="mt-2 grid grid-cols-[140px_1fr] gap-x-4 gap-y-1 text-xs">
              {s.rows.map(([k, v]) => (
                <div className="contents" key={k}>
                  <dt className="text-slate-500">{k}</dt>
                  <dd className="text-slate-200 font-mono break-all">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
        {hasStripe && (
          <div className="px-5 py-4">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-200">
              <CreditCard size={14} className="text-teal-400" />
              Card payment via Stripe
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Use the &ldquo;Pay with card&rdquo; button at the top of this page.
              Funds settle directly to the provider&apos;s account.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
