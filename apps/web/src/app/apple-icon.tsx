import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 180,
          height: 180,
          background: '#0F1117',
          borderRadius: 40,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg width="110" height="110" viewBox="0 0 36 36">
          <circle cx="12" cy="12" r="3" fill="#00C2A8" />
          <circle cx="24" cy="12" r="3" fill="#00C2A8" opacity="0.5" />
          <circle cx="18" cy="24" r="3" fill="#00C2A8" opacity="0.8" />
          <line x1="12" y1="12" x2="24" y2="12" stroke="#00C2A8" strokeWidth="1.5" opacity="0.4" />
          <line x1="12" y1="12" x2="18" y2="24" stroke="#00C2A8" strokeWidth="1.5" opacity="0.4" />
          <line x1="24" y1="12" x2="18" y2="24" stroke="#00C2A8" strokeWidth="1.5" opacity="0.4" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
