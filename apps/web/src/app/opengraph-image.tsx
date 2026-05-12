import { ImageResponse } from 'next/og';
import { SITE_NAME } from '@/lib/site';

// Dynamic Open Graph image — Next.js renders this at /opengraph-image. We force
// runtime rendering (not static export) because @vercel/og + satori crash the
// `next build` pre-render step inside the Alpine Docker builder. At request
// time it works fine, and OG previews are cached aggressively by LinkedIn /
// Slack / Twitter / Facebook so the runtime hit is negligible.
//
// satori rules to keep in mind when editing:
//   - every div with multiple children must have display:flex set explicitly
//   - bare text and child elements cannot be siblings — wrap text in <span>
//   - <br /> is not supported — split into separate spans/divs

export const dynamic = 'force-dynamic';
export const alt = `${SITE_NAME} — Senior IT. Delivered.`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '64px',
          background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
          color: '#F1F5F9',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        {/* Top brand row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: 'rgba(20, 184, 166, 0.15)',
              border: '1px solid rgba(20, 184, 166, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#5EEAD4',
              fontWeight: 800,
              fontSize: 22,
            }}
          >
            <span>T</span>
          </div>
          <div style={{ display: 'flex', fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em' }}>
            <span>talvex</span>
            <span style={{ color: '#5EEAD4' }}>IT</span>
          </div>
        </div>

        {/* Main headline */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              fontSize: 80,
              fontWeight: 700,
              letterSpacing: '-0.04em',
              lineHeight: 1.05,
              maxWidth: 980,
            }}
          >
            <span>Senior IT expertise.</span>
            <span style={{ color: '#5EEAD4' }}>Delivered.</span>
          </div>
          <div style={{ display: 'flex', fontSize: 26, color: '#94A3B8', maxWidth: 900, lineHeight: 1.4 }}>
            <span>Verified L2/L3 IT consultants. Fixed-scope contracts. Direct customer-to-supplier invoicing.</span>
          </div>
        </div>

        {/* Footer trust pills */}
        <div style={{ display: 'flex', gap: 16, fontSize: 18, color: '#CBD5E1' }}>
          {['KYC verified', 'Formal proposals', 'GST-compliant invoicing'].map((t) => (
            <div
              key={t}
              style={{
                display: 'flex',
                padding: '8px 16px',
                borderRadius: 999,
                border: '1px solid rgba(148, 163, 184, 0.25)',
                background: 'rgba(15, 23, 42, 0.6)',
              }}
            >
              <span>{t}</span>
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
