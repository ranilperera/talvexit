'use client';
import { useState } from 'react';
import PublicPageShell, { theme as t } from '@/components/public/PublicPageShell';
import { Mail, MessageSquare, CheckCircle2, AlertCircle } from 'lucide-react';

const ENQUIRY_TYPES = [
  'Enterprise / buyer enquiry',
  'Join as an engineer',
  'Register a company',
  'Partnership or integration',
  'Press or media',
  'Technical support',
  'Other',
];

type FormState = 'idle' | 'submitting' | 'success' | 'error';

export default function ContactClient() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [enquiryType, setEnquiryType] = useState('');
  const [message, setMessage] = useState('');
  const [formState, setFormState] = useState<FormState>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !enquiryType || !message.trim()) return;

    setFormState('submitting');
    setErrorMsg('');

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? ''}/api/v1/contact`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // Phone is optional — only send when provided so the server-side
          // light validator doesn't reject empty strings.
          body: JSON.stringify({
            name,
            email,
            enquiry_type: enquiryType,
            message,
            ...(phone.trim() ? { phone: phone.trim() } : {}),
          }),
        },
      );
      if (!res.ok) {
        const body = (await res.json()) as { error?: { message?: string } };
        throw new Error(body.error?.message ?? 'Submission failed');
      }
      setFormState('success');
    } catch (err) {
      setFormState('error');
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: t.cardBg,
    border: `1px solid ${t.cardBorder}`,
    borderRadius: '0.75rem',
    padding: '0.75rem 1rem',
    color: t.headlineColor,
    fontSize: '0.875rem',
    outline: 'none',
  };

  return (
    <PublicPageShell>
      {/* Hero */}
      <section
        className="pt-16 pb-12 px-6 text-center"
        style={{ background: t.section1Bg, borderBottom: `1px solid ${t.sectionBorder}` }}
      >
        <div className="max-w-2xl mx-auto">
          <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: t.eyebrowColor }}>
            Get in touch
          </p>
          <h1 className="font-display font-bold text-4xl mb-4" style={{ color: t.headlineColor }}>
            Contact Us
          </h1>
          <p className="text-lg" style={{ color: t.bodyColor }}>
            Enterprise enquiries, partnership proposals, or questions — we typically respond within 1 business day.
          </p>
        </div>
      </section>

      <section className="py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">

            {/* Contact info */}
            <div className="space-y-8">
              <div>
                <h3 className="font-display font-semibold text-lg mb-4" style={{ color: t.headlineColor }}>
                  Direct contact
                </h3>
                <div className="space-y-4">
                  {[
                    { icon: Mail, label: 'General enquiries', value: 'hello@talvexit.com.au', href: 'mailto:hello@talvexit.com.au' },
                    { icon: Mail, label: 'Enterprise sales', value: 'enterprise@talvexit.com.au', href: 'mailto:enterprise@talvexit.com.au' },
                    { icon: Mail, label: 'Support', value: 'support@talvexit.com.au', href: 'mailto:support@talvexit.com.au' },
                    { icon: Mail, label: 'Press & media', value: 'press@talvexit.com.au', href: 'mailto:press@talvexit.com.au' },
                  ].map(({ icon: Icon, label, value, href }) => (
                    <div key={label} className="flex items-start gap-3">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                        style={{ background: t.chipBg, border: `1px solid ${t.chipBorder}` }}
                      >
                        <Icon size={14} style={{ color: t.accentBg }} />
                      </div>
                      <div>
                        <p className="text-xs mb-0.5" style={{ color: t.mutedColor }}>{label}</p>
                        <a href={href} className="text-sm" style={{ color: t.bodyColor, textDecoration: 'none' }}>
                          {value}
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="font-display font-semibold text-lg mb-3" style={{ color: t.headlineColor }}>
                  Response times
                </h3>
                <div className="space-y-2">
                  {[
                    ['Enterprise enquiries', '4 business hours'],
                    ['General questions', '1 business day'],
                    ['Support tickets', '4 business hours'],
                    ['Press requests', '1 business day'],
                  ].map(([type, time]) => (
                    <div key={type} className="flex justify-between text-sm">
                      <span style={{ color: t.mutedColor }}>{type}</span>
                      <span style={{ color: t.bodyColor }}>{time}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Form */}
            <div className="lg:col-span-2">
              {formState === 'success' ? (
                <div
                  className="p-10 rounded-2xl text-center"
                  style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}` }}
                >
                  <CheckCircle2 size={40} className="mx-auto mb-4" style={{ color: t.accentBg }} />
                  <h3 className="font-display font-bold text-2xl mb-3" style={{ color: t.headlineColor }}>
                    Message received
                  </h3>
                  <p style={{ color: t.bodyColor }}>
                    Thank you for reaching out. We&apos;ll respond to <strong style={{ color: t.headlineColor }}>{email}</strong> within 1 business day.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit}>
                  <div
                    className="p-8 rounded-2xl"
                    style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}` }}
                  >
                    <div className="flex items-center gap-3 mb-6">
                      <MessageSquare size={18} style={{ color: t.accentBg }} />
                      <h3 className="font-display font-semibold text-lg" style={{ color: t.headlineColor }}>
                        Send a message
                      </h3>
                    </div>

                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-semibold mb-1.5" style={{ color: t.mutedColor }}>
                            Full name *
                          </label>
                          <input
                            type="text"
                            required
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Jane Smith"
                            style={inputStyle}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold mb-1.5" style={{ color: t.mutedColor }}>
                            Email address *
                          </label>
                          <input
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="jane@company.com"
                            style={inputStyle}
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold mb-1.5" style={{ color: t.mutedColor }}>
                          Phone number <span style={{ color: t.mutedColor, fontWeight: 400 }}>(optional)</span>
                        </label>
                        <input
                          type="tel"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="+61 4XX XXX XXX"
                          autoComplete="tel"
                          style={inputStyle}
                        />
                        <p className="text-[11px] mt-1" style={{ color: t.mutedColor }}>
                          Include country code if outside Australia.
                        </p>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold mb-1.5" style={{ color: t.mutedColor }}>
                          Enquiry type *
                        </label>
                        <select
                          required
                          value={enquiryType}
                          onChange={(e) => setEnquiryType(e.target.value)}
                          style={{ ...inputStyle, cursor: 'pointer' }}
                        >
                          <option value="" style={{ background: t.pageBg }}>Select enquiry type...</option>
                          {ENQUIRY_TYPES.map((type) => (
                            <option key={type} value={type} style={{ background: t.pageBg }}>{type}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold mb-1.5" style={{ color: t.mutedColor }}>
                          Message *
                        </label>
                        <textarea
                          required
                          rows={5}
                          value={message}
                          onChange={(e) => setMessage(e.target.value)}
                          placeholder="Tell us about your requirement or question..."
                          style={{ ...inputStyle, resize: 'vertical' }}
                        />
                      </div>

                      {formState === 'error' && (
                        <div
                          className="flex items-center gap-2 p-3 rounded-lg text-sm"
                          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#EF4444' }}
                        >
                          <AlertCircle size={14} />
                          {errorMsg}
                        </div>
                      )}

                      <button
                        type="submit"
                        disabled={formState === 'submitting'}
                        className="w-full font-semibold py-3 rounded-xl text-sm transition-all duration-200"
                        style={{
                          background: formState === 'submitting' ? t.mutedColor : t.primaryBg,
                          color: t.primaryText,
                          cursor: formState === 'submitting' ? 'not-allowed' : 'pointer',
                          border: 'none',
                        }}
                      >
                        {formState === 'submitting' ? 'Sending...' : 'Send Message'}
                      </button>

                      <p className="text-xs text-center" style={{ color: t.mutedColor }}>
                        By submitting, you agree to our{' '}
                        <a href="/privacy" style={{ color: t.accentBg, textDecoration: 'none' }}>Privacy Policy</a>.
                      </p>
                    </div>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>
    </PublicPageShell>
  );
}
