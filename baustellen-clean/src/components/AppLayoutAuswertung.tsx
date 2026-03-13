import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { BarChart2, Users, Calendar, LogOut, ChevronLeft, ChevronRight, Home } from 'lucide-react';

const NAV = [
  { to: '/auswertung', icon: Users, label: 'Übersicht alle MA' },
  { to: '/auswertung/detail', icon: BarChart2, label: 'Einzelperson' },
  { to: '/auswertung/monate', icon: Calendar, label: 'Monatsvergleich' },
];

export default function AppLayoutAuswertung({ children }: { children: React.ReactNode }) {
  const { signOut } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#f0f2f5' }}>
      {/* Sidebar */}
      <aside style={{
        width: collapsed ? '64px' : '224px',
        background: '#2d1b69',
        display: 'flex', flexDirection: 'column',
        transition: 'width .3s', flexShrink: 0,
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '20px 16px', borderBottom: '1px solid rgba(255,255,255,.1)' }}>
          <div style={{ width: '32px', height: '32px', background: 'rgba(255,255,255,.2)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '16px' }}>👷</div>
          {!collapsed && <div><p style={{ color: '#fff', fontWeight: '700', fontSize: '14px', margin: 0, lineHeight: 1 }}>WIDI</p><p style={{ color: 'rgba(255,255,255,.5)', fontSize: '10px', margin: 0, marginTop: '2px' }}>MA-Auswertung</p></div>}
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {NAV.map(({ to, icon: Icon, label }) => {
            const active = location.pathname === to;
            return (
              <button
                key={to}
                onClick={() => navigate(to)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '10px 12px', borderRadius: '10px',
                  background: active ? 'rgba(255,255,255,.18)' : 'transparent',
                  color: active ? '#fff' : 'rgba(255,255,255,.6)',
                  fontWeight: active ? '500' : '400',
                  border: 'none', cursor: 'pointer', fontSize: '14px',
                  width: '100%', textAlign: 'left', transition: 'all .15s',
                }}
                onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,.1)'; }}
                onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <Icon size={16} style={{ flexShrink: 0 }} />
                {!collapsed && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>}
              </button>
            );
          })}
        </nav>

        {/* Bottom */}
        <div style={{ padding: '8px', borderTop: '1px solid rgba(255,255,255,.1)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <button
            onClick={() => navigate('/')}
            style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 12px', borderRadius: '10px', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,.4)', fontSize: '13px', width: '100%', textAlign: 'left' }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,.8)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,.4)'}
          >
            <Home size={15} style={{ flexShrink: 0 }} />
            {!collapsed && <span>← Startseite</span>}
          </button>
          <button
            onClick={() => setCollapsed(!collapsed)}
            style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 12px', borderRadius: '10px', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,.4)', fontSize: '13px', width: '100%', textAlign: 'left' }}
          >
            {collapsed ? <ChevronRight size={15} /> : <><ChevronLeft size={15} />{!collapsed && <span>Einklappen</span>}</>}
          </button>
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
