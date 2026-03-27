import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { LogOut, ArrowRight, TrendingUp, HardHat, Ticket, Shield, Settings } from 'lucide-react';

const BEREICHE = [
  {
    path: '/baustellen/dashboard',
    gradient: 'linear-gradient(135deg, #1e3a5f 0%, #2d5a9e 100%)',
    glow: 'rgba(59,130,246,.25)',
    border: 'rgba(59,130,246,.2)',
    accent: '#3b82f6',
    icon: '🏗️',
    IconComp: HardHat,
    titel: 'Baustellen',
    sub: 'Controlling & Management',
    punkte: ['Budget & Kosten überwachen', 'Zeiterfassung & Material', 'Aufträge per PDF importieren', 'Eskalationen & Fotos'],
    badge: 'Baustellen',
    badgeColor: '#3b82f6',
  },
  {
    path: '/tickets/dashboard',
    gradient: 'linear-gradient(135deg, #064e3b 0%, #107A57 100%)',
    glow: 'rgba(16,122,87,.25)',
    border: 'rgba(16,185,129,.2)',
    accent: '#10b981',
    icon: '🎫',
    IconComp: Ticket,
    titel: 'Ticketsystem',
    sub: 'WIDI Controlling',
    punkte: ['Tickets erfassen & bearbeiten', 'Excel-Import & PDF-Rücklauf', 'Monatsauswertungen', 'Begehungen & Analysen'],
    badge: 'Tickets',
    badgeColor: '#10b981',
  },
  {
    path: '/auswertung',
    gradient: 'linear-gradient(135deg, #2d1b69 0%, #4c1d95 100%)',
    glow: 'rgba(139,92,246,.25)',
    border: 'rgba(139,92,246,.2)',
    accent: '#8b5cf6',
    icon: '👷',
    IconComp: TrendingUp,
    titel: 'MA-Auswertung',
    sub: 'Mitarbeiter & Statistik',
    punkte: ['Alle Mitarbeiter auf einen Blick', 'Tickets + Baustellen kombiniert', 'Monatsvergleich & Trends', 'Kostenanalyse pro Person'],
    badge: 'Auswertung',
    badgeColor: '#8b5cf6',
  },
  {
    path: '/dguv',
    gradient: 'linear-gradient(135deg, #78350f 0%, #b45309 100%)',
    glow: 'rgba(245,158,11,.25)',
    border: 'rgba(245,158,11,.2)',
    accent: '#f59e0b',
    icon: '⚡',
    IconComp: Shield,
    titel: 'DGUV',
    sub: 'Prüfung & Roadmap',
    punkte: ['Geräteprüfung verwalten', 'Prüfroadmap visualisieren', 'Jahresvergleich & Auswertung', 'Rohdaten hochladen & abgleichen'],
    badge: 'DGUV',
    badgeColor: '#f59e0b',
  },
  {
    path: '/admin',
    gradient: 'linear-gradient(135deg, #1f2937 0%, #374151 100%)',
    glow: 'rgba(156,163,175,.2)',
    border: 'rgba(156,163,175,.15)',
    accent: '#9ca3af',
    icon: '🔧',
    IconComp: Settings,
    titel: 'Admin',
    sub: 'Systemverwaltung',
    punkte: ['Aktivitätslog einsehen', 'Systemübersicht', 'Benutzerverwaltung', 'Datenbankstatus'],
    badge: 'Admin',
    badgeColor: '#9ca3af',
  },
];

export default function StartPage() {
  const navigate = useNavigate();
  const { signOut, user } = useAuth();

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #070e1a 0%, #0f1f3d 40%, #0a1628 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '32px 24px', fontFamily: "'Inter', system-ui, sans-serif",
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Background effects */}
      <div style={{ position: 'absolute', top: '15%', left: '10%', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(59,130,246,.06) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: '10%', right: '8%', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle, rgba(16,122,87,.06) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', top: '40%', right: '20%', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,92,246,.05) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{
        position: 'absolute', inset: 0, opacity: .025,
        backgroundImage: 'linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)',
        backgroundSize: '60px 60px', pointerEvents: 'none',
      }} />

      {/* Header */}
      <div style={{ width: '100%', maxWidth: 1100, marginBottom: 56, textAlign: 'center', position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 100, padding: '6px 16px', marginBottom: 24, fontSize: 12, color: 'rgba(255,255,255,.5)', fontWeight: 500 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 8px #10b981' }} />
          System aktiv · {user?.email}
        </div>
        <h1 style={{ color: '#fff', fontSize: 52, fontWeight: 900, margin: '0 0 12px', letterSpacing: '-.04em', lineHeight: 1.1 }}>
          WIDI <span style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Controlling</span>
        </h1>
        <p style={{ color: 'rgba(255,255,255,.4)', fontSize: 16, margin: 0, fontWeight: 400 }}>
          Wähle einen Bereich um zu starten
        </p>
      </div>

      {/* Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20, width: '100%', maxWidth: 1100, position: 'relative', zIndex: 1 }}>
        {BEREICHE.map(b => (
          <div
            key={b.path}
            onClick={() => navigate(b.path)}
            style={{
              background: 'rgba(255,255,255,.04)', border: `1px solid ${b.border}`,
              borderRadius: 24, padding: '32px 28px', cursor: 'pointer',
              transition: 'all .25s', position: 'relative', overflow: 'hidden',
            }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLElement;
              el.style.background = 'rgba(255,255,255,.07)';
              el.style.transform = 'translateY(-4px)';
              el.style.boxShadow = `0 24px 60px ${b.glow}`;
              el.style.borderColor = b.accent;
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLElement;
              el.style.background = 'rgba(255,255,255,.04)';
              el.style.transform = 'translateY(0)';
              el.style.boxShadow = 'none';
              el.style.borderColor = b.border;
            }}
          >
            {/* Glow background */}
            <div style={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: '50%', background: b.glow, filter: 'blur(40px)', pointerEvents: 'none' }} />

            {/* Icon */}
            <div style={{
              width: 60, height: 60, borderRadius: 18,
              background: b.gradient, display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 28, marginBottom: 20,
              boxShadow: `0 12px 30px ${b.glow}`,
            }}>
              {b.icon}
            </div>

            {/* Badge */}
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: `${b.accent}18`, border: `1px solid ${b.accent}30`, borderRadius: 100, padding: '3px 10px', marginBottom: 12 }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: b.accent }} />
              <span style={{ fontSize: 11, color: b.accent, fontWeight: 600 }}>{b.badge}</span>
            </div>

            <h2 style={{ color: '#fff', fontSize: 22, fontWeight: 800, margin: '0 0 4px', letterSpacing: '-.02em' }}>{b.titel}</h2>
            <p style={{ color: 'rgba(255,255,255,.4)', fontSize: 12, margin: '0 0 24px', fontWeight: 500 }}>{b.sub}</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 28 }}>
              {b.punkte.map(p => (
                <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 4, height: 4, borderRadius: '50%', background: b.accent, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,.5)', fontWeight: 400 }}>{p}</span>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: b.accent, fontSize: 13, fontWeight: 600 }}>
              Öffnen <ArrowRight size={14} />
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ marginTop: 48, display: 'flex', alignItems: 'center', gap: 16, position: 'relative', zIndex: 1 }}>
        <button onClick={() => signOut()} style={{
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '9px 18px', background: 'rgba(255,255,255,.06)',
          border: '1px solid rgba(255,255,255,.1)', borderRadius: 12,
          color: 'rgba(255,255,255,.5)', fontSize: 13, fontWeight: 500,
          cursor: 'pointer', transition: 'all .15s',
        }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,.15)'; (e.currentTarget as HTMLElement).style.color = '#fca5a5'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,.06)'; (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,.5)'; }}
        >
          <LogOut size={14} /> Abmelden
        </button>
      </div>
    </div>
  );
}
