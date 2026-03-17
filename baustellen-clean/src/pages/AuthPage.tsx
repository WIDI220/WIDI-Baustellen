import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

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

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0a1628 0%, #1a3356 40%, #0f2847 70%, #0a1628 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px', fontFamily: "'Inter', system-ui, sans-serif",
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Decorative blobs */}
      <div style={{ position: 'absolute', top: '10%', left: '5%', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(59,130,246,.12) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: '10%', right: '5%', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(16,122,87,.10) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 800, height: 800, borderRadius: '50%', background: 'radial-gradient(circle, rgba(26,51,86,.3) 0%, transparent 60%)', pointerEvents: 'none' }} />

      {/* Grid pattern */}
      <div style={{
        position: 'absolute', inset: 0, opacity: .03,
        backgroundImage: 'linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)',
        backgroundSize: '40px 40px', pointerEvents: 'none',
      }} />

      <div style={{ width: '100%', maxWidth: 420, position: 'relative', zIndex: 1 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{
            width: 72, height: 72, margin: '0 auto 20px',
            background: 'linear-gradient(135deg, #1e3a5f, #2d5a9e)',
            borderRadius: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 20px 60px rgba(0,0,0,.4), 0 0 0 1px rgba(255,255,255,.1)',
            fontSize: 32,
          }}>🏗️</div>
          <h1 style={{ color: '#fff', fontSize: 28, fontWeight: 800, margin: '0 0 6px', letterSpacing: '-.03em' }}>
            WIDI <span style={{ color: '#3b82f6' }}>Controlling</span>
          </h1>
          <p style={{ color: 'rgba(255,255,255,.4)', fontSize: 13, margin: 0 }}>Baustellen · Tickets · Auswertung</p>
        </div>

        {/* Card */}
        <div style={{
          background: 'rgba(255,255,255,.06)', backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,.1)', borderRadius: 24,
          padding: '36px 36px 32px', boxShadow: '0 32px 80px rgba(0,0,0,.3)',
        }}>
          <h2 style={{ color: '#fff', fontSize: 18, fontWeight: 700, margin: '0 0 6px' }}>Willkommen zurück</h2>
          <p style={{ color: 'rgba(255,255,255,.4)', fontSize: 13, margin: '0 0 28px' }}>Bitte melde dich an um fortzufahren</p>

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ color: 'rgba(255,255,255,.6)', fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 7, letterSpacing: '.04em', textTransform: 'uppercase' }}>E-Mail</label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)} required
                placeholder="deine@email.de"
                style={{
                  width: '100%', padding: '12px 16px', borderRadius: 12, boxSizing: 'border-box',
                  background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.12)',
                  color: '#fff', fontSize: 14, outline: 'none',
                  transition: 'border-color .15s',
                }}
                onFocus={e => e.target.style.borderColor = 'rgba(59,130,246,.6)'}
                onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,.12)'}
              />
            </div>

            <div>
              <label style={{ color: 'rgba(255,255,255,.6)', fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 7, letterSpacing: '.04em', textTransform: 'uppercase' }}>Passwort</label>
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)} required
                placeholder="••••••••"
                style={{
                  width: '100%', padding: '12px 16px', borderRadius: 12, boxSizing: 'border-box',
                  background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.12)',
                  color: '#fff', fontSize: 14, outline: 'none',
                  transition: 'border-color .15s',
                }}
                onFocus={e => e.target.style.borderColor = 'rgba(59,130,246,.6)'}
                onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,.12)'}
              />
            </div>

            {error && (
              <div style={{ background: 'rgba(239,68,68,.15)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 10, padding: '10px 14px', color: '#fca5a5', fontSize: 13 }}>
                ⚠️ {error}
              </div>
            )}

            <button type="submit" disabled={loading} style={{
              width: '100%', padding: '13px', marginTop: 4,
              background: loading ? 'rgba(59,130,246,.4)' : 'linear-gradient(135deg, #2563eb, #1d4ed8)',
              color: '#fff', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: loading ? 'none' : '0 8px 24px rgba(37,99,235,.4)',
              transition: 'all .2s', letterSpacing: '.01em',
            }}>
              {loading ? 'Wird angemeldet…' : 'Anmelden →'}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', color: 'rgba(255,255,255,.2)', fontSize: 11, marginTop: 24 }}>
          WIDI Controlling System · Interner Zugang
        </p>
      </div>
    </div>
  );
}
