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
          backgroundColor: '#e0f7ff',
          backgroundImage: 'linear-gradient(135deg, #e0f7ff 0%, #b8e6ff 50%, #90d5ff 100%)',
          fontFamily: 'Inter, system-ui, sans-serif',
          position: 'relative',
        }}
      >
        {/* Subtle water pattern */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundImage: 'radial-gradient(circle, rgba(0, 150, 255, 0.08) 2px, transparent 2px)',
            backgroundSize: '40px 40px',
          }}
        />
        
        {/* Light glow */}
        <div
          style={{
            position: 'absolute',
            top: '35%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '400px',
            height: '400px',
            background: 'radial-gradient(circle, rgba(0, 150, 255, 0.3) 0%, transparent 70%)',
            borderRadius: '50%',
            filter: 'blur(40px)',
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
          {/* Robot Icon */}
          <div
            style={{
              fontSize: '60px',
              marginBottom: '20px',
              filter: 'drop-shadow(0 4px 8px rgba(0, 0, 0, 0.15))',
            }}
          >
            🤖
          </div>
          
          {/* INFILTRATE */}
          <div
            style={{
              fontSize: '72px',
              fontWeight: '900',
              marginBottom: '12px',
              color: '#004d7a',
              textShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
              letterSpacing: '4px',
            }}
          >
            INFILTRATE
          </div>
          
          {/* ETHConf */}
          <div
            style={{
              fontSize: '28px',
              fontWeight: '700',
              marginBottom: '24px',
              color: '#0066aa',
              letterSpacing: '2px',
            }}
          >
            ETHConf 2026 🎯
          </div>
          
          {/* Mission */}
          <div
            style={{
              fontSize: '30px',
              fontWeight: '600',
              color: '#003d66',
              maxWidth: '900px',
              lineHeight: '1.4',
              marginBottom: '20px',
            }}
          >
            Become a Field Agent. Pay Water Back.
          </div>
          
          {/* Subtext */}
          <div
            style={{
              fontSize: '22px',
              fontWeight: '400',
              color: '#005a94',
              maxWidth: '800px',
              lineHeight: '1.5',
              marginBottom: '35px',
            }}
          >
            Complete 6 missions. Claim your Genesis badge on XRPL.
          </div>
          
          {/* CTA */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '16px 36px',
              background: 'linear-gradient(135deg, #0077cc 0%, #005a94 100%)',
              borderRadius: '50px',
              boxShadow: '0 8px 32px rgba(0, 119, 204, 0.3)',
            }}
          >
            <span style={{ fontSize: '28px' }}>🏅</span>
            <span
              style={{
                fontSize: '22px',
                fontWeight: '800',
                color: '#ffffff',
              }}
            >
              JOIN THE MISSION
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
