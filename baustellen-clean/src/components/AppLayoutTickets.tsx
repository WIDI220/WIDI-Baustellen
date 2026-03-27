import { ReactNode } from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useMonth } from '@/contexts/MonthContext';
import { useAuth } from '@/contexts/AuthContext';
import { LayoutDashboard, Ticket, FileSpreadsheet, FileText, Users, TrendingUp, LogOut, ChevronLeft, ChevronRight, ClipboardCheck, Home, ClipboardList } from 'lucide-react';

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
    <div style={{ margin: '0 12px 8px' }}>
      <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: 'rgba(255,255,255,.3)', fontWeight: 600, marginBottom: 6, paddingLeft: 4 }}>Zeitraum</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 12, padding: '6px 8px' }}>
        <button onClick={prev} style={{ padding: '4px', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 8, display: 'flex', alignItems: 'center', transition: 'background .15s' }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,.1)'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'none'}
        >
          <ChevronLeft style={{ width: 12, height: 12, color: 'rgba(255,255,255,.6)' }} />
        </button>
        <span style={{ fontSize: 11, fontWeight: 600, flex: 1, textAlign: 'center', color: 'rgba(255,255,255,.9)', letterSpacing: '-.01em' }}>{label}</span>
        <button onClick={next} style={{ padding: '4px', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 8, display: 'flex', alignItems: 'center', transition: 'background .15s' }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,.1)'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'none'}
        >
          <ChevronRight style={{ width: 12, height: 12, color: 'rgba(255,255,255,.6)' }} />
        </button>
      </div>
    </div>
  );
}

const NAV_ITEMS = [
  { to: '/tickets/dashboard',    icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/tickets/verwaltung',   icon: ClipboardList,   label: 'Verwaltung' },
  { to: '/tickets/liste',        icon: Ticket,          label: 'Tickets' },
  { to: '/tickets/import',       icon: FileSpreadsheet, label: 'Excel-Import' },
  { to: '/tickets/pdf-ruecklauf',icon: FileText,        label: 'PDF-Rücklauf' },
  { to: '/tickets/mitarbeiter',  icon: Users,           label: 'Mitarbeiter' },
  { to: '/tickets/analyse',      icon: TrendingUp,      label: 'Analyse' },
  { to: '/tickets/aufgaben',     icon: ClipboardCheck,  label: 'Begehungen' },
];

function NavLink({ to, icon: Icon, children, badge }: { to: string; icon: any; children: string; badge?: number }) {
  const location = useLocation();
  const active = location.pathname === to || (to !== '/tickets/dashboard' && location.pathname.startsWith(to));

  return (
    <Link to={to} style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
      borderRadius: 12, textDecoration: 'none', fontSize: 13, fontWeight: 500,
      transition: 'all .15s',
      background: active ? 'rgba(16,185,129,.2)' : 'transparent',
      color: active ? '#fff' : 'rgba(255,255,255,.55)',
      borderLeft: active ? '3px solid #10b981' : '3px solid transparent',
    }}
      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,.06)'; (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,.9)'; }}
      onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,.55)'; } }}
    >
      <Icon style={{ width: 15, height: 15, flexShrink: 0 }} />
      <span style={{ flex: 1 }}>{children}</span>
      {badge != null && badge > 0 && (
        <span style={{ fontSize:10, fontWeight:700, background:'#ef4444', color:'#fff', borderRadius:99, padding:'1px 6px', minWidth:18, textAlign:'center' }}>
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </Link>
  );
}

export default function AppLayoutTickets({ children }: { children: ReactNode }) {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const { data: openCount = 0 } = useQuery({
    queryKey: ['open-ticket-count'],
    queryFn: async () => {
      const { count } = await supabase
        .from('tickets')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'in_bearbeitung');
      return count ?? 0;
    },
    refetchInterval: 60000,
  });

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#f0f4f8', fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Sidebar */}
      <aside style={{
        width: 220, background: 'linear-gradient(180deg, #064e3b 0%, #065f46 100%)',
        display: 'flex', flexDirection: 'column', flexShrink: 0,
        boxShadow: '4px 0 20px rgba(0,0,0,.15)',
      }}>
        {/* Logo */}
        <div style={{ padding: '20px 16px 16px', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ width: 34, height: 34, background: 'linear-gradient(135deg, #10b981, #059669)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, boxShadow: '0 4px 12px rgba(16,185,129,.3)' }}>🎫</div>
            <div>
              <p style={{ color: '#fff', fontWeight: 800, fontSize: 14, margin: 0, letterSpacing: '-.01em' }}>WIDI</p>
              <p style={{ color: 'rgba(255,255,255,.4)', fontSize: 10, margin: 0, letterSpacing: '.04em' }}>Controlling</p>
            </div>
          </div>
          {/* Startseite Button */}
          <button onClick={() => navigate('/')} style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 8,
            padding: '7px 10px', background: 'rgba(255,255,255,.08)',
            border: '1px solid rgba(255,255,255,.12)', borderRadius: 10,
            color: 'rgba(255,255,255,.7)', fontSize: 12, fontWeight: 500,
            cursor: 'pointer', transition: 'all .15s',
          }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,.14)'; (e.currentTarget as HTMLElement).style.color = '#fff'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,.08)'; (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,.7)'; }}
          >
            <Home size={13} /> ← Startseite
          </button>
        </div>

        {/* Month Stepper */}
        <div style={{ padding: '12px 0 4px' }}>
          <MonthStepper />
        </div>

        {/* Nav */}
        <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: 'rgba(255,255,255,.25)', fontWeight: 600, padding: '8px 16px 4px', margin: 0 }}>Navigation</p>
        <nav style={{ flex: 1, padding: '4px 8px', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' }}>
          {NAV_ITEMS.map(({ to, icon, label }) => (
            <NavLink key={to} to={to} icon={icon} badge={label === 'Verwaltung' ? openCount : undefined}>{label}</NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div style={{ padding: '12px 8px', borderTop: '1px solid rgba(255,255,255,.08)' }}>
          <button onClick={() => signOut()} style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 12px', background: 'none', border: 'none',
            color: 'rgba(255,255,255,.4)', fontSize: 12, fontWeight: 500,
            cursor: 'pointer', borderRadius: 10, transition: 'all .15s',
          }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,.15)'; (e.currentTarget as HTMLElement).style.color = '#fca5a5'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,.4)'; }}
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
