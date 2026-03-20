import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { HardHat, Ticket, TrendingUp } from 'lucide-react';

export default function AuthPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError('E-Mail oder Passwort falsch');
    setLoading(false);
  };

  const features = [
    { icon: HardHat,   label: 'Baustellen',  sub: 'Budget & Controlling', color: '#2563eb' },
    { icon: Ticket,    label: 'Tickets',      sub: 'OCR & Auswertung',     color: '#10b981' },
    { icon: TrendingUp,label: 'Analysen',     sub: 'Mitarbeiter & Kosten', color: '#8b5cf6' },
  ];

  return (
    <div style={{
      minHeight: '100vh',
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        @keyframes fadeIn { from{opacity:0} to{opacity:1} }
        .auth-left { animation: fadeIn 0.5s ease forwards; }
        .auth-card { animation: fadeUp 0.5s ease 0.1s forwards; opacity:0; }
        .feature-item { animation: fadeUp 0.4s ease forwards; opacity:0; }
        .feature-item:nth-child(1){animation-delay:0.2s}
        .feature-item:nth-child(2){animation-delay:0.3s}
        .feature-item:nth-child(3){animation-delay:0.4s}
        .auth-input:focus { border-color: #2563eb !important; box-shadow: 0 0 0 3px rgba(37,99,235,0.1) !important; }
        .login-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 12px 28px rgba(37,99,235,0.4) !important; }
        .login-btn:active:not(:disabled) { transform: translateY(0); }
      `}</style>

      {/* Links — Brand Panel */}
      <div className="auth-left" style={{
        background: 'linear-gradient(145deg, #0f172a 0%, #1e293b 60%, #0f172a 100%)',
        display: 'flex', flexDirection: 'column',
        justifyContent: 'center', padding: '60px 64px',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Decorative circles */}
        <div style={{ position:'absolute', top:-100, right:-100, width:400, height:400, borderRadius:'50%', background:'rgba(37,99,235,0.08)', pointerEvents:'none' }} />
        <div style={{ position:'absolute', bottom:-80, left:-80, width:300, height:300, borderRadius:'50%', background:'rgba(16,185,129,0.06)', pointerEvents:'none' }} />

        {/* Logo */}
        <div style={{ marginBottom: 56, position:'relative', zIndex:1 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16,
            background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 20, boxShadow: '0 8px 24px rgba(37,99,235,0.4)',
          }}>
            <HardHat size={26} style={{ color: '#fff' }} />
          </div>
          <h1 style={{ color: '#fff', fontSize: 34, fontWeight: 900, margin: '0 0 8px', letterSpacing: '-.04em', lineHeight: 1.1 }}>
            WIDI<br />
            <span style={{ background: 'linear-gradient(135deg, #3b82f6, #60a5fa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Controlling
            </span>
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, margin: 0, lineHeight: 1.6 }}>
            Das interne System für<br />Baustellen, Tickets und Auswertungen
          </p>
        </div>

        {/* Features */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, position:'relative', zIndex:1 }}>
          {features.map((f, i) => (
            <div key={i} className="feature-item" style={{
              display: 'flex', alignItems: 'center', gap: 16,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 14, padding: '14px 18px',
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                background: `${f.color}20`,
                border: `1px solid ${f.color}30`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <f.icon size={18} style={{ color: f.color }} />
              </div>
              <div>
                <p style={{ color: '#fff', fontSize: 13, fontWeight: 700, margin: 0 }}>{f.label}</p>
                <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, margin: 0 }}>{f.sub}</p>
              </div>
              <div style={{ marginLeft: 'auto', width: 6, height: 6, borderRadius: '50%', background: f.color }} />
            </div>
          ))}
        </div>

        <p style={{ color: 'rgba(255,255,255,0.15)', fontSize: 11, marginTop: 48, position:'relative', zIndex:1 }}>
          WIDI Hellersen GmbH · Internes System
        </p>
      </div>

      {/* Rechts — Login Form */}
      <div style={{
        background: '#f8fafc',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '40px',
      }}>
        <div className="auth-card" style={{ width: '100%', maxWidth: 380 }}>

          <div style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 26, fontWeight: 800, color: '#0f172a', margin: '0 0 6px', letterSpacing: '-.03em' }}>
              Willkommen zurück
            </h2>
            <p style={{ fontSize: 14, color: '#94a3b8', margin: 0 }}>
              Bitte melde dich an um fortzufahren
            </p>
          </div>

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 7, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                E-Mail
              </label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)} required
                placeholder="deine@email.de"
                className="auth-input"
                style={{
                  width: '100%', padding: '11px 14px', borderRadius: 12, boxSizing: 'border-box',
                  background: '#fff', border: '1px solid #e2e8f0',
                  color: '#0f172a', fontSize: 14, outline: 'none',
                  transition: 'all .15s', fontFamily: 'inherit',
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 7, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                Passwort
              </label>
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)} required
                placeholder="••••••••"
                className="auth-input"
                style={{
                  width: '100%', padding: '11px 14px', borderRadius: 12, boxSizing: 'border-box',
                  background: '#fff', border: '1px solid #e2e8f0',
                  color: '#0f172a', fontSize: 14, outline: 'none',
                  transition: 'all .15s', fontFamily: 'inherit',
                }}
              />
            </div>

            {error && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', color: '#dc2626', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>⚠️</span> {error}
              </div>
            )}

            <button
              type="submit" disabled={loading}
              className="login-btn"
              style={{
                width: '100%', padding: '13px',
                background: loading ? '#94a3b8' : 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                color: '#fff', border: 'none', borderRadius: 12,
                fontSize: 14, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
                boxShadow: '0 8px 20px rgba(37,99,235,0.3)',
                transition: 'all .2s', fontFamily: 'inherit', letterSpacing: '.01em',
              }}>
              {loading ? 'Wird angemeldet…' : 'Anmelden →'}
            </button>
          </form>

          <p style={{ textAlign: 'center', color: '#cbd5e1', fontSize: 11, marginTop: 28 }}>
            Bei Problemen wende dich an deinen Administrator
          </p>
        </div>
      </div>
    </div>
  );
}
