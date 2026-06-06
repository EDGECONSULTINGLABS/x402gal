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
          backgroundImage: 'linear-gradient(135deg, #0a1628 0%, #0d2137 50%, #1e3a5f 100%)',
          fontFamily: 'Inter, system-ui, sans-serif',
          position: 'relative',
        }}
      >
        {/* Background glow */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '600px',
            height: '600px',
            background: 'radial-gradient(circle, rgba(96, 165, 250, 0.15) 0%, transparent 70%)',
            borderRadius: '50%',
          }}
        />
        
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            padding: '50px',
            width: '100%',
            position: 'relative',
            zIndex: 1,
          }}
        >
          {/* Water Drop */}
          <div
            style={{
              fontSize: '100px',
              marginBottom: '10px',
              filter: 'drop-shadow(0 0 30px rgba(0, 229, 255, 0.6))',
            }}
          >
            💧
          </div>
          
          {/* x402GAL */}
          <div
            style={{
              fontSize: '80px',
              fontWeight: '900',
              marginBottom: '16px',
              background: 'linear-gradient(135deg, #60a5fa 0%, #3b82f6 50%, #2563eb 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              letterSpacing: '-3px',
            }}
          >
            x402GAL
          </div>
          
          {/* Tagline */}
          <div
            style={{
              fontSize: '36px',
              fontWeight: '700',
              marginBottom: '20px',
              color: '#ffffff',
              letterSpacing: '-1px',
            }}
          >
            Every AI query has a water footprint
          </div>
          
          {/* Description */}
          <div
            style={{
              fontSize: '22px',
              fontWeight: '400',
              color: '#94a3b8',
              maxWidth: '800px',
              lineHeight: '1.5',
              marginBottom: '35px',
            }}
          >
            Pay it back in real time. Verified water offsets settled on XRPL.
          </div>
          
          {/* XRPL Badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '15px',
              padding: '14px 28px',
              background: 'linear-gradient(135deg, #00E5FF 0%, #00B8D4 100%)',
              borderRadius: '50px',
              boxShadow: '0 8px 32px rgba(0, 229, 255, 0.3)',
            }}
          >
            <span style={{ fontSize: '24px' }}>⚡</span>
            <span
              style={{
                fontSize: '20px',
                fontWeight: '700',
                color: '#000814',
              }}
            >
              Powered by XRPL
            </span>
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
