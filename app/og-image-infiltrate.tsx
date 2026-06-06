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
          backgroundColor: '#000814',
          backgroundImage: 'linear-gradient(135deg, #000814 0%, #04162a 50%, #0a1f3d 100%)',
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
            padding: '50px',
            width: '100%',
          }}
        >
          {/* Robot/Agent Icon */}
          <div
            style={{
              fontSize: '80px',
              marginBottom: '20px',
            }}
          >
            🤖
          </div>
          
          {/* Title */}
          <div
            style={{
              fontSize: '56px',
              fontWeight: '800',
              marginBottom: '16px',
              color: '#00E5FF',
              textShadow: '0 0 30px rgba(0, 229, 255, 0.5)',
              letterSpacing: '-1px',
            }}
          >
            INFILTRATE
          </div>
          
          {/* Subtitle */}
          <div
            style={{
              fontSize: '32px',
              fontWeight: '600',
              marginBottom: '24px',
              color: '#e2e8f0',
            }}
          >
            x402GAL @ ETHConf
          </div>
          
          {/* Description */}
          <div
            style={{
              fontSize: '24px',
              fontWeight: '400',
              color: '#94a3b8',
              maxWidth: '800px',
              lineHeight: '1.4',
              marginBottom: '30px',
            }}
          >
            Become a field agent. Complete missions. Claim your Genesis badge.
          </div>
          
          {/* Mission badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '14px 28px',
              border: '2px solid #00E5FF',
              borderRadius: '30px',
              backgroundColor: 'rgba(0, 229, 255, 0.1)',
            }}
          >
            <span style={{ fontSize: '24px' }}>🏅</span>
            <span
              style={{
                fontSize: '20px',
                fontWeight: '600',
                color: '#00E5FF',
              }}
            >
              6 Missions • Holo Badge • XRPL
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
