import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { LogOut, ArrowRight, TrendingUp, HardHat, Ticket, Users, BarChart3, FileText, Clock } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const BEREICHE = [
  {
    path: '/baustellen/dashboard',
    color: '#2563eb',
    colorLight: '#eff6ff',
    colorMid: '#bfdbfe',
    icon: HardHat,
    titel: 'Baustellen',
    sub: 'Controlling & Management',
    punkte: ['Budget & Kosten', 'Zeiterfassung & Material', 'Aufträge importieren', 'Eskalationen & Fotos'],
  },
  {
    path: '/tickets/dashboard',
    color: '#059669',
    colorLight: '#f0fdf4',
    colorMid: '#bbf7d0',
    icon: Ticket,
    titel: 'Ticketsystem',
    sub: 'WIDI Controlling',
    punkte: ['Tickets erfassen', 'Excel-Import', 'PDF-Rücklauf OCR', 'Monatsauswertungen'],
  },
  {
    path: '/auswertung',
    color: '#7c3aed',
    colorLight: '#faf5ff',
    colorMid: '#ddd6fe',
    icon: TrendingUp,
    titel: 'MA-Auswertung',
    sub: 'Mitarbeiter & Statistik',
    punkte: ['Alle Mitarbeiter', 'Tickets & Baustellen', 'Monatsvergleich', 'Kostenanalyse'],
  },
];

export default function StartPage() {
  const navigate = useNavigate();
  const { signOut, user } = useAuth();

  const { data: tickets = [] } = useQuery({
    queryKey: ['start-tickets'],
    queryFn: async () => { const { data } = await supabase.from('tickets').select('status'); return data ?? []; }
  });
  const { data: baustellen = [] } = useQuery({
    queryKey: ['start-baustellen'],
    queryFn: async () => { const { data } = await supabase.from('baustellen').select('status'); return data ?? []; }
  });
  const { data: employees = [] } = useQuery({
    queryKey: ['start-employees'],
    queryFn: async () => { const { data } = await supabase.from('employees').select('id').eq('aktiv', true); return data ?? []; }
  });

  const t = tickets as any[];
  const b = baustellen as any[];

  const stats = [
    { label: 'Tickets aktiv', value: t.filter(x => x.status === 'in_bearbeitung').length, icon: Ticket, color: '#2563eb' },
    { label: 'Baustellen', value: b.filter(x => x.status !== 'abgerechnet').length, icon: HardHat, color: '#059669' },
    { label: 'Mitarbeiter', value: (employees as any[]).length, icon: Users, color: '#7c3aed' },
    { label: 'Erledigt', value: t.filter(x => x.status === 'erledigt' || x.status === 'abgerechnet').length, icon: BarChart3, color: '#f59e0b' },
  ];

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f8fafc',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideRight {
          from { width: 0; }
          to { width: 100%; }
        }
        .start-card {
          animation: fadeUp 0.5s ease forwards;
          opacity: 0;
        }
        .start-card:nth-child(1) { animation-delay: 0.1s; }
        .start-card:nth-child(2) { animation-delay: 0.2s; }
        .start-card:nth-child(3) { animation-delay: 0.3s; }
        .stat-card {
          animation: fadeUp 0.4s ease forwards;
          opacity: 0;
        }
        .stat-card:nth-child(1) { animation-delay: 0.05s; }
        .stat-card:nth-child(2) { animation-delay: 0.1s; }
        .stat-card:nth-child(3) { animation-delay: 0.15s; }
        .stat-card:nth-child(4) { animation-delay: 0.2s; }
        .bereich-card:hover .bereich-arrow { transform: translateX(4px); }
        .bereich-card:hover .bereich-bar { width: 100% !important; }
      `}</style>

      {/* Top Nav */}
      <nav style={{
        background: '#fff',
        borderBottom: '1px solid #e2e8f0',
        padding: '0 40px',
        height: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 50,
        animation: 'fadeIn 0.3s ease forwards',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10,
            background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <HardHat size={18} style={{ color: '#fff' }} />
          </div>
          <div>
            <p style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-.02em' }}>WIDI Controlling</p>
            <p style={{ fontSize: 10, color: '#94a3b8', margin: 0 }}>WIDI Hellersen GmbH</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 7,
            background: '#f0fdf4', border: '1px solid #bbf7d0',
            borderRadius: 20, padding: '4px 12px',
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} />
            <span style={{ fontSize: 11, color: '#065f46', fontWeight: 600 }}>System aktiv</span>
          </div>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>{user?.email}</span>
          <button onClick={() => signOut()} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 14px', background: '#fff',
            border: '1px solid #e2e8f0', borderRadius: 10,
            color: '#64748b', fontSize: 12, fontWeight: 500, cursor: 'pointer',
            transition: 'all .15s',
          }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#fef2f2'; (e.currentTarget as HTMLElement).style.color = '#dc2626'; (e.currentTarget as HTMLElement).style.borderColor = '#fecaca'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#fff'; (e.currentTarget as HTMLElement).style.color = '#64748b'; (e.currentTarget as HTMLElement).style.borderColor = '#e2e8f0'; }}
          >
            <LogOut size={13} /> Abmelden
          </button>
        </div>
      </nav>

      {/* Hero */}
      <div style={{
        background: 'linear-gradient(135deg, #1e3a8a 0%, #1e40af 50%, #2563eb 100%)',
        padding: '56px 40px 48px',
        position: 'relative',
        overflow: 'hidden',
        animation: 'fadeIn 0.4s ease forwards',
      }}>
        {/* Decorative circles */}
        <div style={{ position: 'absolute', top: -60, right: -60, width: 300, height: 300, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -80, right: 200, width: 250, height: 250, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: 20, left: '40%', width: 180, height: 180, borderRadius: '50%', background: 'rgba(255,255,255,0.03)', pointerEvents: 'none' }} />

        <div style={{ maxWidth: 900, margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 24 }}>
            <div>
              <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: 500, margin: '0 0 10px', letterSpacing: '.05em', textTransform: 'uppercase' }}>
                {new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
              <h1 style={{ color: '#fff', fontSize: 42, fontWeight: 900, margin: '0 0 8px', letterSpacing: '-.04em', lineHeight: 1.1 }}>
                Guten Tag 👋
              </h1>
              <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 16, margin: 0 }}>
                Wähle einen Bereich um zu starten
              </p>
            </div>
            {/* Mini stats im Hero */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
              {stats.map((s, i) => (
                <div key={i} className="stat-card" style={{
                  background: 'rgba(255,255,255,0.1)',
                  backdropFilter: 'blur(10px)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: 14,
                  padding: '14px 16px',
                  textAlign: 'center',
                  minWidth: 90,
                }}>
                  <s.icon size={16} style={{ color: 'rgba(255,255,255,0.7)', marginBottom: 6 }} />
                  <p style={{ color: '#fff', fontSize: 22, fontWeight: 800, margin: '0 0 2px', letterSpacing: '-.03em' }}>{s.value}</p>
                  <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, margin: 0, fontWeight: 500 }}>{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bereich Cards */}
      <div style={{ flex: 1, padding: '40px', maxWidth: 980, margin: '0 auto', width: '100%' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20 }}>
          {BEREICHE.map((b, i) => (
            <div
              key={b.path}
              className="start-card bereich-card"
              onClick={() => navigate(b.path)}
              style={{
                background: '#fff',
                border: '1px solid #e2e8f0',
                borderRadius: 20,
                padding: '28px 24px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                position: 'relative',
                overflow: 'hidden',
              }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLElement;
                el.style.transform = 'translateY(-4px)';
                el.style.boxShadow = `0 20px 50px ${b.color}22`;
                el.style.borderColor = b.colorMid;
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLElement;
                el.style.transform = 'translateY(0)';
                el.style.boxShadow = 'none';
                el.style.borderColor = '#e2e8f0';
              }}
            >
              {/* Top accent line */}
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${b.color}, ${b.color}88)` }} />

              {/* Icon */}
              <div style={{
                width: 52, height: 52, borderRadius: 16,
                background: b.colorLight,
                border: `1px solid ${b.colorMid}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: 18,
              }}>
                <b.icon size={24} style={{ color: b.color }} />
              </div>

              <h2 style={{ color: '#0f172a', fontSize: 20, fontWeight: 800, margin: '0 0 4px', letterSpacing: '-.03em' }}>{b.titel}</h2>
              <p style={{ color: '#94a3b8', fontSize: 12, margin: '0 0 20px', fontWeight: 500 }}>{b.sub}</p>

              {/* Feature list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 24 }}>
                {b.punkte.map(p => (
                  <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: b.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: '#64748b' }}>{p}</span>
                  </div>
                ))}
              </div>

              {/* Animated bottom bar */}
              <div style={{ height: 2, background: '#f1f5f9', borderRadius: 99, marginBottom: 16, overflow: 'hidden' }}>
                <div className="bereich-bar" style={{
                  height: '100%', width: '30%',
                  background: `linear-gradient(90deg, ${b.color}, ${b.color}88)`,
                  borderRadius: 99,
                  transition: 'width 0.4s ease',
                }} />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: b.color, fontSize: 13, fontWeight: 600 }}>
                Öffnen
                <ArrowRight size={14} className="bereich-arrow" style={{ transition: 'transform 0.2s ease' }} />
              </div>
            </div>
          ))}
        </div>

        {/* Bottom info */}
        <div style={{
          marginTop: 32,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 24,
        }}>
          {[
            { icon: Clock, text: 'Echtzeit-Daten' },
            { icon: FileText, text: 'OCR PDF-Rücklauf' },
            { icon: BarChart3, text: 'Monatsauswertungen' },
          ].map((item, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#94a3b8', fontSize: 12 }}>
              <item.icon size={14} />
              <span>{item.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
