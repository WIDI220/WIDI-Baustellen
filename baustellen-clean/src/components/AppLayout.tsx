import { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { LayoutDashboard, HardHat, Clock, Package, FileText, Camera, AlertTriangle, LogOut, ChevronLeft, ChevronRight, FileUp, Users, Home, Archive } from 'lucide-react';

const NAV = [
  { to: '/baustellen/dashboard',    icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/baustellen/liste',        icon: HardHat,         label: 'Baustellen' },
  { to: '/baustellen/zeiterfassung',icon: Clock,           label: 'Zeiterfassung' },
  { to: '/baustellen/material',     icon: Package,         label: 'Material' },
  { to: '/baustellen/nachtraege',   icon: FileText,        label: 'Nachträge' },
  { to: '/baustellen/fotos',        icon: Camera,          label: 'Fotos' },
  { to: '/baustellen/eskalationen', icon: AlertTriangle,   label: 'Eskalationen' },
  { to: '/baustellen/mitarbeiter',  icon: Users,           label: 'Mitarbeiter' },
  { to: '/baustellen/import',       icon: FileUp,          label: 'Auftrag importieren' },
  { to: '/baustellen/archiv',       icon: Archive,         label: 'Archiv' },
];

const ACCENT = '#2563eb';
const ACCENT_LIGHT = 'rgba(37,99,235,0.15)';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#f8fafc', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <style>{`
        .nav-item { transition: all 0.15s ease; }
        .nav-item:hover { background: rgba(255,255,255,0.08) !important; color: #fff !important; }
        .nav-item.active { background: ${ACCENT_LIGHT} !important; color: #fff !important; }
        .collapse-btn:hover { background: rgba(255,255,255,0.1) !important; }
      `}</style>

      {/* Sidebar */}
      <aside style={{
        width: collapsed ? 64 : 220,
        background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        transition: 'width 0.25s ease',
        overflow: 'hidden',
        boxShadow: '4px 0 24px rgba(0,0,0,0.15)',
        position: 'relative',
        zIndex: 10,
      }}>

        {/* Logo */}
        <div style={{
          padding: collapsed ? '18px 0' : '18px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          justifyContent: collapsed ? 'center' : 'flex-start',
        }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10, flexShrink: 0,
            background: `linear-gradient(135deg, ${ACCENT}, #1d4ed8)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 4px 12px rgba(37,99,235,0.4)`,
          }}>
            <HardHat size={17} style={{ color: '#fff' }} />
          </div>
          {!collapsed && (
            <div>
              <p style={{ color: '#fff', fontWeight: 800, fontSize: 13, margin: 0, letterSpacing: '-.01em' }}>WIDI</p>
              <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10, margin: 0 }}>Baustellen</p>
            </div>
          )}
        </div>

        {/* Startseite Button — oben */}
        <div style={{ padding:'8px 8px 2px' }}>
          <button onClick={() => navigate('/')}
            style={{ display:'flex', alignItems:'center', gap:collapsed?0:8, justifyContent:collapsed?'center':'flex-start', width:'100%', padding:collapsed?'9px 0':'7px 12px', background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:10, color:'rgba(255,255,255,0.5)', fontSize:11, fontWeight:500, cursor:'pointer', transition:'all .15s' }}
            onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background='rgba(255,255,255,0.12)';(e.currentTarget as HTMLElement).style.color='#fff';}}
            onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='rgba(255,255,255,0.06)';(e.currentTarget as HTMLElement).style.color='rgba(255,255,255,0.5)';}}>
            <Home size={13} />
            {!collapsed && <span>Startseite</span>}
          </button>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '4px 8px', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' }}>
          {!collapsed && (
            <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: 'rgba(255,255,255,0.2)', fontWeight: 600, padding: '6px 8px 4px', margin: 0 }}>Navigation</p>
          )}
          {NAV.map(({ to, icon: Icon, label }) => {
            const active = location.pathname === to || location.pathname.startsWith(to + '/');
            return (
              <NavLink key={to} to={to}
                className={`nav-item ${active ? 'active' : ''}`}
                style={{
                  display: 'flex', alignItems: 'center',
                  gap: collapsed ? 0 : 10,
                  padding: collapsed ? '10px 0' : '8px 12px',
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  borderRadius: 10, textDecoration: 'none', fontSize: 13, fontWeight: 500,
                  color: active ? '#fff' : 'rgba(255,255,255,0.45)',
                  borderLeft: active ? `3px solid ${ACCENT}` : '3px solid transparent',
                  position: 'relative',
                }}>
                <Icon size={15} style={{ flexShrink: 0 }} />
                {!collapsed && <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>}
                {collapsed && active && (
                  <div style={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', width: 3, height: 20, background: ACCENT, borderRadius: '3px 0 0 3px' }} />
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Bottom */}
        <div style={{ padding: '8px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: 2 }}>

          <button onClick={() => setCollapsed(!collapsed)}
            className="collapse-btn"
            style={{
              display: 'flex', alignItems: 'center', gap: collapsed ? 0 : 8,
              justifyContent: collapsed ? 'center' : 'flex-start',
              width: '100%', padding: collapsed ? '10px 0' : '8px 12px',
              background: 'none', border: 'none', borderRadius: 10,
              color: 'rgba(255,255,255,0.35)', fontSize: 12, fontWeight: 500, cursor: 'pointer',
            }}>
            {collapsed ? <ChevronRight size={14} /> : <><ChevronLeft size={14} /><span>Einklappen</span></>}
          </button>
          <button onClick={signOut}
            className="collapse-btn"
            style={{
              display: 'flex', alignItems: 'center', gap: collapsed ? 0 : 8,
              justifyContent: collapsed ? 'center' : 'flex-start',
              width: '100%', padding: collapsed ? '10px 0' : '8px 12px',
              background: 'none', border: 'none', borderRadius: 10,
              color: 'rgba(255,255,255,0.3)', fontSize: 12, fontWeight: 500, cursor: 'pointer',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#fca5a5'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.3)'; }}>
            <LogOut size={14} />
            {!collapsed && <span>Abmelden</span>}
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
