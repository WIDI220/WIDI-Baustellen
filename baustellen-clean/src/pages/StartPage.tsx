import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { LogOut } from 'lucide-react';

const BEREICHE = [
  {
    path: '/baustellen/dashboard',
    farbe: '#1a3356',
    rand: 'rgba(26,51,86,.3)',
    icon: '🏗️',
    titel: 'Baustellen',
    sub: 'Controlling · Zeiterfassung · Material · Nachträge · Fotos',
    punkte: ['Baustellen anlegen & verwalten', 'Budget & Kosten überwachen', 'Aufträge per PDF importieren'],
  },
  {
    path: '/tickets/dashboard',
    farbe: '#107A57',
    rand: 'rgba(16,122,87,.3)',
    icon: '🎫',
    titel: 'Ticketsystem',
    sub: 'Tickets · Zeiterfassung · Analyse · Eskalationen',
    punkte: ['Tickets erfassen & bearbeiten', 'Stunden pro Ticket buchen', 'Monatsauswertungen & PDF'],
  },
  {
    path: '/auswertung',
    farbe: '#2d1b69',
    rand: 'rgba(45,27,105,.3)',
    icon: '👷',
    titel: 'Mitarbeiter-Auswertung',
    sub: 'Stunden aus beiden Systemen · Monatsvergleich',
    punkte: ['Alle Mitarbeiter auf einen Blick', 'Tickets + Baustellen kombiniert', 'Monatsvergleich & Detail'],
  },
];

export default function StartPage() {
  const navigate = useNavigate();
  const { signOut, user } = useAuth();

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f1f3d 0%, #1a3356 50%, #0f2847 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '32px 24px',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '48px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginBottom: '12px' }}>
          <div style={{ width: '48px', height: '48px', background: 'rgba(255,255,255,.15)', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px' }}>W</div>
          <div style={{ textAlign: 'left' }}>
            <p style={{ color: '#fff', fontSize: '24px', fontWeight: '700', margin: 0, letterSpacing: '-.02em' }}>WIDI</p>
            <p style={{ color: 'rgba(255,255,255,.45)', fontSize: '12px', margin: 0 }}>Controlling & Verwaltung</p>
          </div>
        </div>
        <p style={{ color: 'rgba(255,255,255,.5)', fontSize: '14px', margin: 0 }}>
          Hallo {user?.email?.split('@')[0]} · Wähle einen Bereich
        </p>
      </div>

      {/* Kacheln */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '16px',
        width: '100%',
        maxWidth: '960px',
        marginBottom: '40px',
      }}>
        {BEREICHE.map((b) => (
          <button
            key={b.path}
            onClick={() => navigate(b.path)}
            style={{
              background: 'rgba(255,255,255,.06)',
              border: `1.5px solid ${b.rand}`,
              borderRadius: '20px',
              padding: '28px 24px',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'all .2s',
              outline: 'none',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,.11)';
              (e.currentTarget as HTMLElement).style.borderColor = b.farbe;
              (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,.06)';
              (e.currentTarget as HTMLElement).style.borderColor = b.rand;
              (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
            }}
          >
            {/* Icon + Titel */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px' }}>
              <div style={{
                width: '52px', height: '52px',
                background: b.farbe,
                borderRadius: '14px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '24px', flexShrink: 0,
              }}>{b.icon}</div>
              <div>
                <p style={{ color: '#fff', fontSize: '18px', fontWeight: '600', margin: '0 0 4px', letterSpacing: '-.01em' }}>{b.titel}</p>
                <p style={{ color: 'rgba(255,255,255,.4)', fontSize: '11px', margin: 0, lineHeight: 1.4 }}>{b.sub}</p>
              </div>
            </div>

            {/* Punkte */}
            <div style={{ borderTop: '1px solid rgba(255,255,255,.08)', paddingTop: '14px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {b.punkte.map(p => (
                <div key={p} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: b.farbe, flexShrink: 0, opacity: .9 }} />
                  <span style={{ color: 'rgba(255,255,255,.55)', fontSize: '12px' }}>{p}</span>
                </div>
              ))}
            </div>

            {/* Pfeil */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
              <div style={{ color: 'rgba(255,255,255,.3)', fontSize: '18px', transition: 'transform .2s' }}>→</div>
            </div>
          </button>
        ))}
      </div>

      {/* Abmelden */}
      <button
        onClick={signOut}
        style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'rgba(255,255,255,.3)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', padding: '8px 16px', borderRadius: '8px' }}
        onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,.6)'}
        onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,.3)'}
      >
        <LogOut size={14} /> Abmelden
      </button>
    </div>
  );
}
