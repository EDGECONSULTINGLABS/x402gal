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
          backgroundImage: 'linear-gradient(135deg, #000814 0%, #0a1628 50%, #0d2847 100%)',
          fontFamily: 'Inter, system-ui, sans-serif',
          position: 'relative',
        }}
      >
        {/* Animated grid background effect */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundImage: 'linear-gradient(rgba(0, 229, 255, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 229, 255, 0.03) 1px, transparent 1px)',
            backgroundSize: '50px 50px',
          }}
        />
        
        {/* Glowing orb effect */}
        <div
          style={{
            position: 'absolute',
            top: '40%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '500px',
            height: '500px',
            background: 'radial-gradient(circle, rgba(0, 229, 255, 0.2) 0%, transparent 60%)',
            borderRadius: '50%',
            filter: 'blur(60px)',
          }}
        />
        
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            padding: '45px',
            width: '100%',
            position: 'relative',
            zIndex: 1,
          }}
        >
          {/* Agent/Robot Icon with glow */}
          <div
            style={{
              fontSize: '90px',
              marginBottom: '15px',
              filter: 'drop-shadow(0 0 40px rgba(0, 229, 255, 0.8))',
            }}
          >
            🤖
          </div>
          
          {/* Main Title - INFILTRATE */}
          <div
            style={{
              fontSize: '72px',
              fontWeight: '900',
              marginBottom: '12px',
              color: '#00E5FF',
              textShadow: '0 0 50px rgba(0, 229, 255, 0.6), 0 0 100px rgba(0, 229, 255, 0.3)',
              letterSpacing: '4px',
            }}
          >
            INFILTRATE
          </div>
          
          {/* ETHConf Badge */}
          <div
            style={{
              fontSize: '28px',
              fontWeight: '700',
              marginBottom: '24px',
              color: '#FFD700',
              letterSpacing: '2px',
            }}
          >
            ETHConf 2026 🎯
          </div>
          
          {/* Mission Statement */}
          <div
            style={{
              fontSize: '30px',
              fontWeight: '600',
              color: '#ffffff',
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
              color: '#94a3b8',
              maxWidth: '800px',
              lineHeight: '1.5',
              marginBottom: '35px',
            }}
          >
            Complete 6 missions. Claim your Genesis badge on XRPL.
          </div>
          
          {/* CTA Button */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '16px 36px',
              background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)',
              borderRadius: '50px',
              boxShadow: '0 8px 32px rgba(255, 215, 0, 0.4)',
            }}
          >
            <span style={{ fontSize: '28px' }}>🏅</span>
            <span
              style={{
                fontSize: '22px',
                fontWeight: '800',
                color: '#000000',
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
