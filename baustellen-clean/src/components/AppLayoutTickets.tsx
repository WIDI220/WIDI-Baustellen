import { ReactNode } from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useMonth } from '@/contexts/MonthContext';
import { getLocalSession, clearLocalSession } from '@/pages/AuthPage';
import { LayoutDashboard, Ticket, FileSpreadsheet, FileText, Users, TrendingUp, LogOut, ChevronLeft, ChevronRight, ClipboardCheck, Home, ClipboardList, Timer } from 'lucide-react';
import { useEffect } from 'react';
import { logPageVisit } from '@/lib/activityLog';

function MonthStepper() {
  const { activeMonth, setActiveMonth } = useMonth();
  const [year, month] = activeMonth.split('-').map(Number);

  const prev = () => {
    const d = new Date(year, month - 2, 1);
    setActiveMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };
  const next = () => {
    const d = new Date(year, month, 1);
    setActiveMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const label = new Date(year, month - 1, 1).toLocaleString('de-DE', { month: 'long', year: 'numeric' });

  return (
    <div style={{ margin: '0 8px 4px' }}>
      <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: 'rgba(255,255,255,0.2)', fontWeight: 600, marginBottom: 6, paddingLeft: 4 }}>Zeitraum</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '5px 6px' }}>
        <button onClick={prev} style={{ padding: '3px', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 6, display: 'flex', alignItems: 'center', color: 'rgba(255,255,255,0.5)', transition: 'all .15s' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.1)'; (e.currentTarget as HTMLElement).style.color = '#fff'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.5)'; }}>
          <ChevronLeft size={12} />
        </button>
        <span style={{ fontSize: 11, fontWeight: 600, flex: 1, textAlign: 'center', color: 'rgba(255,255,255,0.85)', letterSpacing: '-.01em' }}>{label}</span>
        <button onClick={next} style={{ padding: '3px', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 6, display: 'flex', alignItems: 'center', color: 'rgba(255,255,255,0.5)', transition: 'all .15s' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.1)'; (e.currentTarget as HTMLElement).style.color = '#fff'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.5)'; }}>
          <ChevronRight size={12} />
        </button>
      </div>
    </div>
  );
}

const NAV_ITEMS = [
  { to: '/tickets/dashboard',     icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/tickets/verwaltung',    icon: ClipboardList,   label: 'Verwaltung' },
  { to: '/tickets/liste',         icon: Ticket,          label: 'Tickets' },
  { to: '/tickets/import',        icon: FileSpreadsheet, label: 'Excel-Import' },
  { to: '/tickets/pdf-ruecklauf', icon: FileText,        label: 'PDF-Rücklauf' },
  { to: '/tickets/mitarbeiter',   icon: Users,           label: 'Mitarbeiter' },
  { to: '/tickets/analyse',       icon: TrendingUp,      label: 'Analyse' },
  { to: '/tickets/aufgaben',      icon: ClipboardCheck,  label: 'Begehungen' },
  { to: '/tickets/intern',        icon: Timer,           label: 'Interne Std.' },
];

const ACCENT = '#10b981';
const ACCENT_LIGHT = 'rgba(16,185,129,0.15)';

function NavItem({ to, icon: Icon, children, badge }: { to: string; icon: any; children: string; badge?: number }) {
  const location = useLocation();
  const active = location.pathname === to || (to !== '/tickets/dashboard' && location.pathname.startsWith(to));

  return (
    <Link to={to} style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
      borderRadius: 10, textDecoration: 'none', fontSize: 13, fontWeight: 500,
      transition: 'all .15s',
      background: active ? ACCENT_LIGHT : 'transparent',
      color: active ? '#fff' : 'rgba(255,255,255,0.45)',
      borderLeft: active ? `3px solid ${ACCENT}` : '3px solid transparent',
    }}
      onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'; (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.85)'; } }}
      onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.45)'; } }}
    >
      <Icon size={15} style={{ flexShrink: 0 }} />
      <span style={{ flex: 1 }}>{children}</span>
      {badge != null && badge > 0 && (
        <span style={{ fontSize: 10, fontWeight: 700, background: '#ef4444', color: '#fff', borderRadius: 99, padding: '1px 6px', minWidth: 18, textAlign: 'center' }}>
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </Link>
  );
}

export default function AppLayoutTickets({ children }: { children: ReactNode }) {
  const signOut = () => { clearLocalSession(); window.location.href = '/'; };
  const navigate = useNavigate();

  const { data: openCount = 0 } = useQuery({
    queryKey: ['open-ticket-count'],
    queryFn: async () => {
      const { count } = await supabase.from('tickets').select('*', { count: 'exact', head: true }).eq('status', 'in_bearbeitung');
      return count ?? 0;
    },
    refetchInterval: 60000,
  });
  const location = useLocation();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) {
        const pageNames: Record<string, string> = {
          '/tickets/dashboard': 'Tickets Dashboard',
          '/tickets/liste': 'Ticket-Liste',
          '/tickets/import': 'Excel-Import',
          '/tickets/pdf-ruecklauf': 'PDF-Rücklauf',
          '/tickets/mitarbeiter': 'Ticket-Mitarbeiter',
          '/tickets/analyse': 'Ticket-Analyse',
          '/tickets/aufgaben': 'Begehungen',
        };
        const pageName = pageNames[location.pathname] ?? location.pathname;
        logPageVisit(data.user.email, pageName);
      }
    });
  }, [location.pathname]);

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#f8fafc', fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* Sidebar */}
      <aside style={{
        width: 220,
        background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)',
        display: 'flex', flexDirection: 'column', flexShrink: 0,
        boxShadow: '4px 0 24px rgba(0,0,0,0.15)',
        position: 'relative', zIndex: 10,
      }}>

        {/* Logo */}
        <div style={{ padding: '18px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 10, flexShrink: 0,
              background: `linear-gradient(135deg, ${ACCENT}, #059669)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 4px 12px rgba(16,185,129,0.4)`,
            }}>
              <Ticket size={17} style={{ color: '#fff' }} />
            </div>
            <div>
              <p style={{ color: '#fff', fontWeight: 800, fontSize: 13, margin: 0, letterSpacing: '-.01em' }}>WIDI</p>
              <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10, margin: 0 }}>Ticketsystem</p>
            </div>
          </div>
          <button onClick={() => navigate('/')} style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 7,
            padding: '6px 10px', background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8,
            color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: 500,
            cursor: 'pointer', transition: 'all .15s', justifyContent: 'center',
          }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.12)'; (e.currentTarget as HTMLElement).style.color = '#fff'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'; (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.5)'; }}
          >
            <Home size={12} /> Startseite
          </button>
        </div>

        {/* Month Stepper */}
        <div style={{ padding: '12px 0 4px' }}>
          <MonthStepper />
        </div>

        {/* Nav */}
        <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: 'rgba(255,255,255,0.2)', fontWeight: 600, padding: '6px 16px 4px', margin: 0 }}>Navigation</p>
        <nav style={{ flex: 1, padding: '4px 8px', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' }}>
          {NAV_ITEMS.map(({ to, icon, label }) => (
            <NavItem key={to} to={to} icon={icon} badge={label === 'Verwaltung' ? openCount : undefined}>{label}</NavItem>
          ))}
        </nav>

        {/* Footer */}
        <div style={{ padding: '8px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <button onClick={signOut} style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 12px', background: 'none', border: 'none',
            color: 'rgba(255,255,255,0.3)', fontSize: 12, fontWeight: 500,
            cursor: 'pointer', borderRadius: 10, transition: 'all .15s',
          }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#fca5a5'; (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.1)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.3)'; (e.currentTarget as HTMLElement).style.background = 'none'; }}
          >
            <LogOut size={14} /> Abmelden
          </button>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>
        {children}
      </main>
    </div>
  );
}
