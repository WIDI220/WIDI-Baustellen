import { useState, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { logPageVisit } from '@/lib/activityLog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { LayoutDashboard, HardHat, Clock, Package, FileText, Camera, AlertTriangle, LogOut, ChevronLeft, ChevronRight, FileUp, Users, Home, Archive, Zap, Building2 } from 'lucide-react';

const NAV = [
  { to: '/baustellen/dashboard',     icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/baustellen/zeiterfassung', icon: Clock,           label: 'Zeiterfassung' },
  { to: '/baustellen/material',      icon: Package,         label: 'Material' },
  { to: '/baustellen/nachtraege',    icon: FileText,        label: 'Nachträge' },
  { to: '/baustellen/fotos',         icon: Camera,          label: 'Fotos' },
  { to: '/baustellen/eskalationen',  icon: AlertTriangle,   label: 'Eskalationen' },
  { to: '/baustellen/mitarbeiter',   icon: Users,           label: 'Mitarbeiter' },
  { to: '/baustellen/import',        icon: FileUp,          label: 'Auftrag importieren' },
  { to: '/baustellen/archiv',        icon: Archive,         label: 'Archiv' },
];

const ACCENT = '#2563eb';
const ACCENT_LIGHT = 'rgba(37,99,235,0.15)';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  // Baustellen nach Gewerk laden für Sidebar
  const { data: baustellen = [] } = useQuery({
    queryKey: ['sidebar-baustellen'],
    queryFn: async () => {
      const { data } = await supabase
        .from('baustellen')
        .select('id, name, gewerk, status')
        .not('status', 'in', '("abgerechnet","abgeschlossen")')
        .order('name');
      return data ?? [];
    },
    staleTime: 30000,
  });

  const bs = baustellen as any[];
  const hochbau = bs.filter(b => b.gewerk === 'Hochbau' || b.gewerk === 'Beides');
  const elektro  = bs.filter(b => b.gewerk === 'Elektro'  || b.gewerk === 'Beides');

  const isBaustellenActive = location.pathname.startsWith('/baustellen/liste');

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) {
        const pageNames: Record<string, string> = {
          '/baustellen/dashboard': 'Baustellen Dashboard',
          '/baustellen/liste': 'Baustellen-Liste',
          '/baustellen/zeiterfassung': 'Zeiterfassung',
          '/baustellen/material': 'Material',
          '/baustellen/nachtraege': 'Nachträge',
          '/baustellen/fotos': 'Fotos',
          '/baustellen/eskalationen': 'Eskalationen',
          '/baustellen/mitarbeiter': 'Mitarbeiter',
          '/baustellen/import': 'Auftrag-Import',
          '/baustellen/archiv': 'Archiv',
        };
        const pageName = pageNames[location.pathname] ?? location.pathname;
        logPageVisit(data.user.email, pageName);
      }
    });
  }, [location.pathname]);

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#f8fafc', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <style>{`
        .nav-item { transition: all 0.15s ease; }
        .nav-item:hover { background: rgba(255,255,255,0.08) !important; color: rgba(255,255,255,0.9) !important; }
        .nav-item.active { background: ${ACCENT_LIGHT} !important; color: #fff !important; }
        .collapse-btn:hover { background: rgba(255,255,255,0.1) !important; }
        .bs-sub-item:hover { background: rgba(255,255,255,0.06) !important; }
        .gewerk-badge { transition: all 0.15s; }
      `}</style>

      {/* Sidebar */}
      <aside style={{
        width: collapsed ? 64 : 230,
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

        {/* Startseite Button */}
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

          {/* Dashboard als erster Eintrag */}
          {(() => {
            const { to, icon: Icon, label } = NAV[0];
            const active = location.pathname === to;
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
                }}>
                <Icon size={15} style={{ flexShrink: 0 }} />
                {!collapsed && <span>{label}</span>}
              </NavLink>
            );
          })()}

          {/* ── BAUSTELLEN mit Gewerk-Unterteilung ── */}
          <div>
            {/* Haupteintrag Baustellen */}
            <div
              onClick={() => navigate('/baustellen/liste')}
              className={`nav-item ${isBaustellenActive ? 'active' : ''}`}
              style={{
                display: 'flex', alignItems: 'center',
                gap: collapsed ? 0 : 10,
                padding: collapsed ? '10px 0' : '8px 12px',
                justifyContent: collapsed ? 'center' : 'flex-start',
                borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 500,
                color: isBaustellenActive ? '#fff' : 'rgba(255,255,255,0.45)',
                borderLeft: isBaustellenActive ? `3px solid ${ACCENT}` : '3px solid transparent',
              }}>
              <HardHat size={15} style={{ flexShrink: 0 }} />
              {!collapsed && (
                <>
                  <span style={{ flex: 1 }}>Baustellen</span>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 99, background: 'rgba(37,99,235,0.3)', color: '#93c5fd' }}>
                    {bs.length}
                  </span>
                </>
              )}
            </div>

            {/* Gewerk-Untergruppen — nur wenn nicht collapsed */}
            {!collapsed && bs.length > 0 && (
              <div style={{ marginLeft: 8, marginBottom: 4 }}>

                {/* Hochbau */}
                {hochbau.length > 0 && (
                  <div style={{ marginBottom: 2 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px 3px', opacity: 0.6 }}>
                      <Building2 size={10} style={{ color: '#60a5fa' }} />
                      <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: '#60a5fa' }}>
                        Hochbau
                      </span>
                      <span style={{ fontSize: 9, fontWeight: 700, padding: '0px 5px', borderRadius: 99, background: 'rgba(96,165,250,0.2)', color: '#60a5fa', marginLeft: 'auto' }}>
                        {hochbau.length}
                      </span>
                    </div>
                    {hochbau.slice(0, 4).map((b: any) => {
                      const isActive = location.pathname === `/baustellen/liste/${b.id}`;
                      return (
                        <div key={b.id}
                          className="bs-sub-item"
                          onClick={() => navigate(`/baustellen/liste/${b.id}`)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '5px 12px',
                            borderRadius: 8, cursor: 'pointer',
                            background: isActive ? 'rgba(96,165,250,0.15)' : 'transparent',
                            borderLeft: isActive ? '2px solid #60a5fa' : '2px solid transparent',
                          }}>
                          <div style={{ width: 5, height: 5, borderRadius: '50%', background: isActive ? '#60a5fa' : 'rgba(255,255,255,0.2)', flexShrink: 0 }} />
                          <span style={{ fontSize: 11, color: isActive ? '#93c5fd' : 'rgba(255,255,255,0.4)', fontWeight: isActive ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {b.name?.length > 22 ? b.name.slice(0, 20) + '…' : b.name}
                          </span>
                        </div>
                      );
                    })}
                    {hochbau.length > 4 && (
                      <div onClick={() => navigate('/baustellen/liste')} style={{ padding: '3px 12px', fontSize: 10, color: 'rgba(255,255,255,0.2)', cursor: 'pointer' }}>
                        +{hochbau.length - 4} weitere
                      </div>
                    )}
                  </div>
                )}

                {/* Elektro */}
                {elektro.length > 0 && (
                  <div style={{ marginBottom: 2 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px 3px', opacity: 0.6 }}>
                      <Zap size={10} style={{ color: '#34d399' }} />
                      <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: '#34d399' }}>
                        Elektro
                      </span>
                      <span style={{ fontSize: 9, fontWeight: 700, padding: '0px 5px', borderRadius: 99, background: 'rgba(52,211,153,0.2)', color: '#34d399', marginLeft: 'auto' }}>
                        {elektro.length}
                      </span>
                    </div>
                    {elektro.slice(0, 4).map((b: any) => {
                      const isActive = location.pathname === `/baustellen/liste/${b.id}`;
                      return (
                        <div key={b.id}
                          className="bs-sub-item"
                          onClick={() => navigate(`/baustellen/liste/${b.id}`)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '5px 12px',
                            borderRadius: 8, cursor: 'pointer',
                            background: isActive ? 'rgba(52,211,153,0.15)' : 'transparent',
                            borderLeft: isActive ? '2px solid #34d399' : '2px solid transparent',
                          }}>
                          <div style={{ width: 5, height: 5, borderRadius: '50%', background: isActive ? '#34d399' : 'rgba(255,255,255,0.2)', flexShrink: 0 }} />
                          <span style={{ fontSize: 11, color: isActive ? '#6ee7b7' : 'rgba(255,255,255,0.4)', fontWeight: isActive ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {b.name?.length > 22 ? b.name.slice(0, 20) + '…' : b.name}
                          </span>
                        </div>
                      );
                    })}
                    {elektro.length > 4 && (
                      <div onClick={() => navigate('/baustellen/liste')} style={{ padding: '3px 12px', fontSize: 10, color: 'rgba(255,255,255,0.2)', cursor: 'pointer' }}>
                        +{elektro.length - 4} weitere
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Rest der Nav-Items */}
          {NAV.slice(1).map(({ to, icon: Icon, label }) => {
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
