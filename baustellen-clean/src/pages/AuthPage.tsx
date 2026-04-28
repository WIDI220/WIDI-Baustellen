import { useState } from 'react';
import { HardHat, Ticket, TrendingUp } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

export interface AppUser {
  id: string;
  email: string;
  name: string;
  is_admin: boolean;
  is_active: boolean;
  permissions: Record<string, { kann_sehen: boolean; kann_bearbeiten: boolean }>;
}

const SESSION_KEY = 'widi_session';

export function getLocalSession(): AppUser | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function clearLocalSession() {
  localStorage.removeItem(SESSION_KEY);
}

export function hasPermission(bereich: string, typ: 'sehen' | 'bearbeiten'): boolean {
  const session = getLocalSession();
  if (!session) return false;
  if (session.is_admin) return true;
  const perm = session.permissions?.[bereich];
  if (!perm) return false;
  return typ === 'sehen' ? perm.kann_sehen : perm.kann_bearbeiten;
}

export default function AuthPage({ onLogin }: { onLogin: (user: AppUser) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { data: user } = await supabase
        .from('app_users')
        .select('*')
        .eq('email', email.trim().toLowerCase())
        .eq('password_hash', password)
        .eq('is_active', true)
        .maybeSingle();

      if (!user) { setError('E-Mail oder Passwort falsch'); setLoading(false); return; }

      const { data: perms } = await supabase.from('app_permissions').select('*').eq('user_id', user.id);
      const permissions: Record<string, { kann_sehen: boolean; kann_bearbeiten: boolean }> = {};
      (perms ?? []).forEach((p: any) => { permissions[p.bereich] = { kann_sehen: p.kann_sehen, kann_bearbeiten: p.kann_bearbeiten }; });

      const appUser: AppUser = { id: user.id, email: user.email, name: user.name, is_admin: user.is_admin, is_active: user.is_active, permissions };

      await supabase.from('app_users').update({ last_login: new Date().toISOString() }).eq('id', user.id);
      await supabase.from('app_activity_log').insert({ user_email: user.email, user_name: user.name, aktion: 'login', details: 'Anmeldung erfolgreich' });

      localStorage.setItem(SESSION_KEY, JSON.stringify(appUser));
      onLogin(appUser);
    } catch { setError('Verbindungsfehler — bitte neu laden'); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: '1fr 1fr', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #1e40af 100%)', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '60px 56px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 48 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: 'linear-gradient(135deg,#2563eb,#1d4ed8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: '#fff' }}>W</span>
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#fff' }}>WIDI Hellersen</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Gebäudeservice Controlling</div>
          </div>
        </div>
        <h1 style={{ fontSize: 38, fontWeight: 900, color: '#fff', lineHeight: 1.15, margin: '0 0 32px' }}>
          Ihr digitales<br /><span style={{ color: '#60a5fa' }}>Controlling-System</span>
        </h1>
        {[
          { icon: HardHat, label: 'Baustellen', sub: 'Budget & Controlling', color: '#2563eb' },
          { icon: Ticket, label: 'Tickets', sub: 'OCR & Auswertung', color: '#10b981' },
          { icon: TrendingUp, label: 'Analysen', sub: 'Mitarbeiter & Kosten', color: '#8b5cf6' },
        ].map(({ icon: Icon, label, sub, color }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', background: 'rgba(255,255,255,0.06)', borderRadius: 14, border: '1px solid rgba(255,255,255,0.08)', marginBottom: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: `${color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon size={16} style={{ color }} />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{label}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{sub}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', padding: 40 }}>
        <div style={{ width: '100%', maxWidth: 400 }}>
          <h2 style={{ fontSize: 26, fontWeight: 800, color: '#0f172a', margin: '0 0 6px' }}>Willkommen zurück</h2>
          <p style={{ fontSize: 13, color: '#94a3b8', margin: '0 0 32px' }}>Melden Sie sich mit Ihren Zugangsdaten an</p>
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>E-Mail</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="name@widi-hellersen.de"
                style={{ width: '100%', padding: '11px 14px', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: 14, color: '#0f172a', background: '#fff', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Passwort</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••"
                style={{ width: '100%', padding: '11px 14px', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: 14, color: '#0f172a', background: '#fff', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            {error && <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 13, color: '#dc2626' }}>{error}</div>}
            <button type="submit" disabled={loading}
              style={{ padding: '13px', background: 'linear-gradient(135deg,#2563eb,#1d4ed8)', color: '#fff', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
              {loading ? 'Anmelden...' : 'Anmelden'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
