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
            Pay it back in real time. Settle water offsets on XRPL for every inference.
          </div>
          
          {/* Water Drop Icon */}
          <div
            style={{
              fontSize: '72px',
              marginBottom: '20px',
            }}
          >
            💧
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
