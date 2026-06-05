import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0a1628',
          backgroundImage: 'linear-gradient(135deg, #0a1628 0%, #1e3a5f 100%)',
          fontFamily: 'Inter, system-ui, sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            padding: '60px',
            width: '100%',
          }}
        >
          {/* Main Logo/Title */}
          <div
            style={{
              fontSize: '72px',
              fontWeight: '800',
              marginBottom: '24px',
              background: 'linear-gradient(135deg, #60a5fa 0%, #3b82f6 50%, #2563eb 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              letterSpacing: '-2px',
            }}
          >
            x402GAL
          </div>
          
          {/* Tagline */}
          <div
            style={{
              fontSize: '32px',
              fontWeight: '600',
              marginBottom: '32px',
              color: '#e2e8f0',
              maxWidth: '800px',
              lineHeight: '1.2',
            }}
          >
            Water-offset rails for AI agents
          </div>
          
          {/* Description */}
          <div
            style={{
              fontSize: '20px',
              fontWeight: '400',
              color: '#94a3b8',
              maxWidth: '700px',
              lineHeight: '1.5',
              marginBottom: '40px',
            }}
          >
            x402-native water sustainability layer enabling AI agents to pay per inference in HydroCoin with cross-chain settlement
          </div>
          
          {/* Water Drop Icon */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '80px',
              height: '80px',
              marginBottom: '20px',
            }}
          >
            <svg width="80" height="80" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 2.69l5.66 5.66a8 8 0 1 1-11.32 0z"
                fill="#60a5fa"
                stroke="#3b82f6"
                strokeWidth="1.5"
              />
              <path
                d="M12 7v6"
                stroke="#1e3a5f"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <circle cx="12" cy="13" r="2" fill="#1e3a5f" />
            </svg>
          </div>
          
          {/* URL */}
          <div
            style={{
              fontSize: '18px',
              fontWeight: '500',
              color: '#60a5fa',
              padding: '12px 24px',
              border: '2px solid #60a5fa',
              borderRadius: '8px',
              backgroundColor: 'rgba(96, 165, 250, 0.1)',
            }}
          >
            x402gal.com
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
