import { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { LayoutDashboard, Ticket, Clock, BarChart2, Users, AlertTriangle, FileDown, FileUp, LogOut, ChevronLeft, ChevronRight, Home } from 'lucide-react';

const NAV = [
  { to: '/tickets/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/tickets/liste', icon: Ticket, label: 'Tickets' },
  { to: '/tickets/zeiterfassung', icon: Clock, label: 'Zeiterfassung' },
  { to: '/tickets/analyse', icon: BarChart2, label: 'Analyse' },
  { to: '/tickets/mitarbeiter', icon: Users, label: 'Mitarbeiter' },
  { to: '/tickets/eskalationen', icon: AlertTriangle, label: 'Eskalationen' },
  { to: '/tickets/pdf-ruecklauf', icon: FileDown, label: 'PDF-Rücklauf' },
  { to: '/tickets/import', icon: FileUp, label: 'Excel-Import' },
];

export default function AppLayoutTickets({ children }: { children: React.ReactNode }) {
  const { signOut } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#f0f2f5' }}>
      {/* Sidebar */}
      <aside style={{
        width: collapsed ? '64px' : '224px',
        background: '#107A57',
        display: 'flex', flexDirection: 'column',
        transition: 'width .3s', flexShrink: 0,
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '20px 16px', borderBottom: '1px solid rgba(255,255,255,.1)' }}>
          <div style={{ width: '32px', height: '32px', background: 'rgba(255,255,255,.2)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '16px' }}>🎫</div>
          {!collapsed && <div><p style={{ color: '#fff', fontWeight: '700', fontSize: '14px', margin: 0, lineHeight: 1 }}>WIDI</p><p style={{ color: 'rgba(255,255,255,.5)', fontSize: '10px', margin: 0, marginTop: '2px' }}>Ticketsystem</p></div>}
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '12px 8px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {NAV.map(({ to, icon: Icon, label }) => {
            const active = location.pathname === to || location.pathname.startsWith(to + '/');
            return (
              <NavLink
                key={to} to={to}
                style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '10px 12px', borderRadius: '10px',
                  textDecoration: 'none', fontSize: '14px',
                  background: active ? 'rgba(255,255,255,.18)' : 'transparent',
                  color: active ? '#fff' : 'rgba(255,255,255,.6)',
                  fontWeight: active ? '500' : '400',
                  transition: 'all .15s',
                }}
                onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,.1)'; }}
                onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <Icon size={16} style={{ flexShrink: 0 }} />
                {!collapsed && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>}
              </NavLink>
            );
          })}
        </nav>

        {/* Bottom */}
        <div style={{ padding: '8px', borderTop: '1px solid rgba(255,255,255,.1)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {/* Startseite */}
          <button
            onClick={() => navigate('/')}
            style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 12px', borderRadius: '10px', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,.4)', fontSize: '13px', width: '100%', textAlign: 'left', transition: 'color .15s' }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,.8)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,.4)'}
          >
            <Home size={15} style={{ flexShrink: 0 }} />
            {!collapsed && <span>← Startseite</span>}
          </button>

          {/* Einklappen */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 12px', borderRadius: '10px', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,.4)', fontSize: '13px', width: '100%', textAlign: 'left' }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,.8)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,.4)'}
          >
            {collapsed ? <ChevronRight size={15} /> : <><ChevronLeft size={15} />{!collapsed && <span>Einklappen</span>}</>}
          </button>

          {/* Abmelden */}
          <button
            onClick={signOut}
            style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 12px', borderRadius: '10px', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,.4)', fontSize: '13px', width: '100%', textAlign: 'left' }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#fca5a5'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,.4)'}
          >
            <LogOut size={15} style={{ flexShrink: 0 }} />
            {!collapsed && <span>Abmelden</span>}
          </button>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '24px' }}>
          {children}
        </div>
      </main>
    </div>
  );
}
