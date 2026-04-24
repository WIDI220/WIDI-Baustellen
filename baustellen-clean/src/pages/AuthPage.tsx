import { useState } from 'react';
import { HardHat, Ticket, TrendingUp } from 'lucide-react';

// Bitte Passwörter nicht weitergeben
const USERS: Record<string, { password: string; name: string }> = {
  'j.paredis@widi-hellersen.de':  { password: 'jbxy-Fri8', name: 'Jan Paredis' },
  'b.denker@widi-hellersen.de':   { password: '123123',    name: 'B. Denker' },
  'p.paredis@widi-hellersen.de':  { password: '123123',    name: 'P. Paredis' },
  'm.dargel@widi-hellersen.de':   { password: '123123',    name: 'M. Dargel' },
};

// Simulierter Auth-State im localStorage
const SESSION_KEY = 'widi_session';

export function getLocalSession(): { email: string; name: string } | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function clearLocalSession() {
  localStorage.removeItem(SESSION_KEY);
}

export default function AuthPage({ onLogin }: { onLogin: (email: string) => void }) {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const user = USERS[email.trim().toLowerCase()];
    if (user && user.password === password) {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ email: email.trim().toLowerCase(), name: user.name }));
      onLogin(email.trim().toLowerCase());
    } else {
      setError('E-Mail oder Passwort falsch');
    }
    setLoading(false);
  };

  const features = [
    { icon: HardHat,    label: 'Baustellen',  sub: 'Budget & Controlling', color: '#2563eb' },
    { icon: Ticket,     label: 'Tickets',      sub: 'OCR & Auswertung',     color: '#10b981' },
    { icon: TrendingUp, label: 'Analysen',     sub: 'Mitarbeiter & Kosten', color: '#8b5cf6' },
  ];

  return (
    <div style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: '1fr 1fr', fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Links — Branding */}
      <div style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #1e40af 100%)', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '60px 56px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -100, right: -100, width: 400, height: 400, borderRadius: '50%', background: 'rgba(37,99,235,0.15)', filter: 'blur(60px)' }} />
        <div style={{ position: 'absolute', bottom: -80, left: -80, width: 300, height: 300, borderRadius: '50%', background: 'rgba(16,185,129,0.1)', filter: 'blur(40px)' }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 48 }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: 'linear-gradient(135deg,#2563eb,#1d4ed8)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 24px rgba(37,99,235,0.4)' }}>
              <span style={{ fontSize: 22, fontWeight: 800, color: '#fff' }}>W</span>
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', letterSpacing: '-.03em' }}>WIDI Hellersen</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Gebäudeservice Controlling</div>
            </div>
          </div>
          <h1 style={{ fontSize: 38, fontWeight: 900, color: '#fff', lineHeight: 1.15, letterSpacing: '-.04em', margin: '0 0 20px' }}>
            Ihr digitales<br /><span style={{ color: '#60a5fa' }}>Controlling-System</span>
          </h1>
          <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.55)', margin: '0 0 48px', lineHeight: 1.7 }}>
            Alles auf einen Blick — Baustellen, Tickets und Mitarbeiterauswertungen.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {features.map(({ icon: Icon, label, sub, color }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', background: 'rgba(255,255,255,0.06)', borderRadius: 14, border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: `${color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon size={16} style={{ color }} />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{label}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{sub}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Rechts — Login */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', padding: 40 }}>
        <div style={{ width: '100%', maxWidth: 400 }}>
          <h2 style={{ fontSize: 26, fontWeight: 800, color: '#0f172a', margin: '0 0 6px', letterSpacing: '-.03em' }}>Willkommen zurück</h2>
          <p style={{ fontSize: 13, color: '#94a3b8', margin: '0 0 32px' }}>Melden Sie sich mit Ihren Zugangsdaten an</p>

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>E-Mail</label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)} required
                placeholder="name@widi-hellersen.de"
                style={{ width: '100%', padding: '11px 14px', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: 14, color: '#0f172a', background: '#fff', outline: 'none', boxSizing: 'border-box' }}
                onFocus={e => (e.target.style.borderColor = '#2563eb')}
                onBlur={e => (e.target.style.borderColor = '#e2e8f0')}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Passwort</label>
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)} required
                placeholder="••••••••"
                style={{ width: '100%', padding: '11px 14px', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: 14, color: '#0f172a', background: '#fff', outline: 'none', boxSizing: 'border-box' }}
                onFocus={e => (e.target.style.borderColor = '#2563eb')}
                onBlur={e => (e.target.style.borderColor = '#e2e8f0')}
              />
            </div>

            {error && (
              <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 13, color: '#dc2626', fontWeight: 500 }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={loading}
              style={{ padding: '13px', background: 'linear-gradient(135deg,#2563eb,#1d4ed8)', color: '#fff', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 14px rgba(37,99,235,0.35)', marginTop: 4 }}>
              {loading ? 'Anmelden...' : 'Anmelden'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
