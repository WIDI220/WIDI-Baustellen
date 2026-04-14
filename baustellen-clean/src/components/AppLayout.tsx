import { useState, useEffect, useRef, useCallback } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { logPageVisit } from '@/lib/activityLog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { LayoutDashboard, HardHat, Clock, Package, FileText, Camera, AlertTriangle, LogOut, ChevronLeft, ChevronRight, ChevronDown, FileUp, Users, Home, Archive, Zap, Building2, CalendarDays } from 'lucide-react';

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

const ACCENT       = '#2563eb';
const ACCENT_LIGHT = 'rgba(37,99,235,0.15)';
const MIN_WIDTH    = 180;
const MAX_WIDTH    = 420;
const DEFAULT_WIDTH = 230;
const COLLAPSED_WIDTH = 64;

const STATUS_ORDER: Record<string, number> = {
  in_bearbeitung: 0, pausiert: 1, offen: 2, nicht_gestartet: 3, abgeschlossen: 4, abgerechnet: 5,
};

const STATUS_STYLE: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  in_bearbeitung:  { bg: 'rgba(37,99,235,0.18)',   text: '#93c5fd', border: 'rgba(37,99,235,0.35)',  dot: '#3b82f6' },
  pausiert:        { bg: 'rgba(245,158,11,0.18)',  text: '#fcd34d', border: 'rgba(245,158,11,0.35)', dot: '#f59e0b' },
  offen:           { bg: 'rgba(148,163,184,0.12)', text: '#94a3b8', border: 'rgba(148,163,184,0.2)', dot: '#64748b' },
  nicht_gestartet: { bg: 'rgba(234,179,8,0.15)',   text: '#fde047', border: 'rgba(234,179,8,0.3)',   dot: '#eab308' },
  abgeschlossen:   { bg: 'rgba(16,185,129,0.15)',  text: '#6ee7b7', border: 'rgba(16,185,129,0.3)',  dot: '#10b981' },
  abgerechnet:     { bg: 'rgba(139,92,246,0.15)',  text: '#c4b5fd', border: 'rgba(139,92,246,0.3)',  dot: '#8b5cf6' },
};

function sortBaustellen(list: any[]): any[] {
  return [...list].sort((a, b) => {
    const ao = STATUS_ORDER[a.status] ?? 99;
    const bo = STATUS_ORDER[b.status] ?? 99;
    if (ao !== bo) return ao - bo;
    return (a.name || '').localeCompare(b.name || '');
  });
}

function getSavedWidth(): number {
  try {
    const v = localStorage.getItem('sidebar_width');
    if (v) { const n = parseInt(v, 10); if (n >= MIN_WIDTH && n <= MAX_WIDTH) return n; }
  } catch {}
  return DEFAULT_WIDTH;
}

interface GewerkSectionProps {
  label: string; icon: React.ReactNode; accentColor: string; accentBg: string;
  items: any[]; collapsed: boolean; sidebarCollapsed: boolean;
  currentPath: string; onNavigate: (id: string) => void; onToggle: () => void;
  sidebarWidth: number;
}

function GewerkSection({ label, icon, accentColor, accentBg, items, collapsed, sidebarCollapsed, currentPath, onNavigate, onToggle, sidebarWidth }: GewerkSectionProps) {
  if (sidebarCollapsed || items.length === 0) return null;

  return (
    <div style={{ marginBottom: 4 }}>
      <div
        onClick={onToggle}
        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px 4px', cursor: 'pointer', borderRadius: 7, transition: 'background .15s', userSelect: 'none' }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
      >
        <div style={{ color: accentColor, display: 'flex', alignItems: 'center' }}>{icon}</div>
        <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: accentColor, flex: 1 }}>{label}</span>
        <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 99, background: accentBg, color: accentColor }}>{items.length}</span>
        <ChevronDown size={10} style={{ color: accentColor, opacity: 0.7, transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform .2s ease' }} />
      </div>

      {!collapsed && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 2, paddingLeft: 4, paddingRight: 4 }}>
          {items.map((b: any) => {
            const isActive = currentPath === `/baustellen/liste/${b.id}`;
            const st = STATUS_STYLE[b.status] ?? STATUS_STYLE.offen;
            return (
              <div
                key={b.id}
                onClick={() => onNavigate(b.id)}
                title={b.name}
                style={{ display: 'flex', alignItems: 'flex-start', gap: 7, padding: '6px 8px', borderRadius: 8, cursor: 'pointer', background: isActive ? st.bg : 'rgba(255,255,255,0.04)', border: isActive ? `1px solid ${st.border}` : '1px solid transparent', transition: 'all .15s' }}
                onMouseEnter={e => { if (!isActive) { (e.currentTarget as HTMLElement).style.background = st.bg; (e.currentTarget as HTMLElement).style.border = `1px solid ${st.border}`; } }}
                onMouseLeave={e => { if (!isActive) { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'; (e.currentTarget as HTMLElement).style.border = '1px solid transparent'; } }}
              >
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: st.dot, flexShrink: 0, marginTop: 4, boxShadow: isActive ? `0 0 4px ${st.dot}` : 'none' }} />
                <span style={{ fontSize: 11, color: isActive ? st.text : 'rgba(255,255,255,0.55)', fontWeight: isActive ? 600 : 400, flex: 1, lineHeight: 1.4, wordBreak: 'break-word', transition: 'color .15s' }}>
                  {b.name}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { signOut } = useAuth();
  const navigate    = useNavigate();
  const location    = useLocation();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth]         = useState<number>(getSavedWidth);
  const [isResizing, setIsResizing]             = useState(false);

  const [hochbauCollapsed, setHochbauCollapsed] = useState<boolean>(() => {
    try { const v = localStorage.getItem('sidebar_hochbau_collapsed'); return v === null ? true : v === 'true'; } catch { return true; }
  });
  const [elektroCollapsed, setElektroCollapsed] = useState<boolean>(() => {
    try { const v = localStorage.getItem('sidebar_elektro_collapsed'); return v === null ? true : v === 'true'; } catch { return true; }
  });

  const toggleHochbau = () => {
    const next = !hochbauCollapsed; setHochbauCollapsed(next);
    try { localStorage.setItem('sidebar_hochbau_collapsed', String(next)); } catch {}
  };
  const toggleElektro = () => {
    const next = !elektroCollapsed; setElektroCollapsed(next);
    try { localStorage.setItem('sidebar_elektro_collapsed', String(next)); } catch {}
  };

  // ── Resize-Logik ──────────────────────────────────────────────────────────
  const startXRef   = useRef(0);
  const startWRef   = useRef(0);

  const onMouseMove = useCallback((e: MouseEvent) => {
    const delta = e.clientX - startXRef.current;
    const next  = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWRef.current + delta));
    setSidebarWidth(next);
  }, []);

  const onMouseUp = useCallback(() => {
    setIsResizing(false);
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    // Breite speichern
    setSidebarWidth(w => { try { localStorage.setItem('sidebar_width', String(w)); } catch {} return w; });
  }, [onMouseMove]);

  const startResize = useCallback((e: React.MouseEvent) => {
    if (sidebarCollapsed) return;
    e.preventDefault();
    startXRef.current = e.clientX;
    startWRef.current = sidebarWidth;
    setIsResizing(true);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [sidebarCollapsed, sidebarWidth, onMouseMove, onMouseUp]);

  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);
  // ─────────────────────────────────────────────────────────────────────────

  const { data: baustellen = [] } = useQuery({
    queryKey: ['sidebar-baustellen'],
    queryFn: async () => {
      const { data } = await supabase.from('baustellen').select('id, name, gewerk, status').not('status', 'in', '("abgerechnet","abgeschlossen")').order('name');
      return data ?? [];
    },
    staleTime: 30000,
  });

  const bs      = baustellen as any[];
  const hochbau = sortBaustellen(bs.filter(b => b.gewerk === 'Hochbau' || b.gewerk === 'Beides'));
  const elektro = sortBaustellen(bs.filter(b => b.gewerk === 'Elektro'  || b.gewerk === 'Beides'));

  const isBaustellenActive = location.pathname.startsWith('/baustellen/liste');
  const currentWidth = sidebarCollapsed ? COLLAPSED_WIDTH : sidebarWidth;

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) {
        const pageNames: Record<string, string> = {
          '/baustellen/dashboard': 'Baustellen Dashboard', '/baustellen/liste': 'Baustellen-Liste',
          '/baustellen/zeiterfassung': 'Zeiterfassung', '/baustellen/material': 'Material',
          '/baustellen/nachtraege': 'Nachträge', '/baustellen/fotos': 'Fotos',
          '/baustellen/eskalationen': 'Eskalationen', '/baustellen/mitarbeiter': 'Mitarbeiter',
          '/baustellen/import': 'Auftrag-Import', '/baustellen/archiv': 'Archiv',
        };
        logPageVisit(data.user.email, pageNames[location.pathname] ?? location.pathname);
      }
    });
  }, [location.pathname]);

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#f8fafc', fontFamily: "'Inter', system-ui, sans-serif", userSelect: isResizing ? 'none' : 'auto' }}>
      <style>{`
        .nav-item { transition: all 0.15s ease; }
        .nav-item:hover { background: rgba(255,255,255,0.08) !important; color: rgba(255,255,255,0.9) !important; }
        .nav-item.active { background: ${ACCENT_LIGHT} !important; color: #fff !important; }
        .collapse-btn:hover { background: rgba(255,255,255,0.1) !important; }
        .resize-handle:hover { background: rgba(255,255,255,0.15) !important; }
      `}</style>

      {/* Sidebar */}
      <aside style={{
        width: currentWidth,
        minWidth: currentWidth,
        background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)',
        display: 'flex', flexDirection: 'column', flexShrink: 0,
        transition: isResizing ? 'none' : 'width 0.25s ease, min-width 0.25s ease',
        overflow: 'hidden',
        boxShadow: '4px 0 24px rgba(0,0,0,0.15)',
        position: 'relative', zIndex: 10,
      }}>

        {/* Logo */}
        <div style={{ padding: sidebarCollapsed ? '18px 0' : '18px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 10, justifyContent: sidebarCollapsed ? 'center' : 'flex-start', flexShrink: 0 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, background: `linear-gradient(135deg, ${ACCENT}, #1d4ed8)`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 4px 12px rgba(37,99,235,0.4)` }}>
            <HardHat size={17} style={{ color: '#fff' }} />
          </div>
          {!sidebarCollapsed && (
            <div style={{ overflow: 'hidden' }}>
              <p style={{ color: '#fff', fontWeight: 800, fontSize: 13, margin: 0, letterSpacing: '-.01em', whiteSpace: 'nowrap' }}>WIDI</p>
              <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10, margin: 0 }}>Baustellen</p>
            </div>
          )}
        </div>

        {/* Startseite */}
        <div style={{ padding: '8px 8px 2px', flexShrink: 0 }}>
          <button onClick={() => navigate('/')}
            style={{ display: 'flex', alignItems: 'center', gap: sidebarCollapsed ? 0 : 8, justifyContent: sidebarCollapsed ? 'center' : 'flex-start', width: '100%', padding: sidebarCollapsed ? '9px 0' : '7px 12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: 500, cursor: 'pointer', transition: 'all .15s', whiteSpace: 'nowrap', overflow: 'hidden' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.12)'; (e.currentTarget as HTMLElement).style.color = '#fff'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'; (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.5)'; }}>
            <Home size={13} style={{ flexShrink: 0 }} />
            {!sidebarCollapsed && <span>Startseite</span>}
          </button>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '4px 8px', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto', overflowX: 'hidden' }}>
          {!sidebarCollapsed && (
            <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: 'rgba(255,255,255,0.2)', fontWeight: 600, padding: '6px 8px 4px', margin: 0, whiteSpace: 'nowrap' }}>Navigation</p>
          )}

          {/* Dashboard */}
          {(() => {
            const { to, icon: Icon, label } = NAV[0];
            const active = location.pathname === to;
            return (
              <NavLink key={to} to={to} className={`nav-item ${active ? 'active' : ''}`}
                style={{ display: 'flex', alignItems: 'center', gap: sidebarCollapsed ? 0 : 10, padding: sidebarCollapsed ? '10px 0' : '8px 12px', justifyContent: sidebarCollapsed ? 'center' : 'flex-start', borderRadius: 10, textDecoration: 'none', fontSize: 13, fontWeight: 500, color: active ? '#fff' : 'rgba(255,255,255,0.45)', borderLeft: active ? `3px solid ${ACCENT}` : '3px solid transparent', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                <Icon size={15} style={{ flexShrink: 0 }} />
                {!sidebarCollapsed && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>}
              </NavLink>
            );
          })()}

          {/* Baustellen Haupteintrag */}
          <div
            onClick={() => navigate('/baustellen/liste')}
            className={`nav-item ${isBaustellenActive ? 'active' : ''}`}
            style={{ display: 'flex', alignItems: 'center', gap: sidebarCollapsed ? 0 : 10, padding: sidebarCollapsed ? '10px 0' : '8px 12px', justifyContent: sidebarCollapsed ? 'center' : 'flex-start', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 500, color: isBaustellenActive ? '#fff' : 'rgba(255,255,255,0.45)', borderLeft: isBaustellenActive ? `3px solid ${ACCENT}` : '3px solid transparent', whiteSpace: 'nowrap', overflow: 'hidden' }}>
            <HardHat size={15} style={{ flexShrink: 0 }} />
            {!sidebarCollapsed && (
              <>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>Baustellen</span>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 99, background: 'rgba(37,99,235,0.3)', color: '#93c5fd', flexShrink: 0 }}>{bs.length}</span>
              </>
            )}
          </div>

          {/* Hochbau */}
          <GewerkSection
            label="Hochbau" icon={<Building2 size={10} />}
            accentColor="#60a5fa" accentBg="rgba(96,165,250,0.15)"
            items={hochbau} collapsed={hochbauCollapsed} sidebarCollapsed={sidebarCollapsed}
            currentPath={location.pathname} onNavigate={id => navigate(`/baustellen/liste/${id}`)}
            onToggle={toggleHochbau} sidebarWidth={sidebarWidth}
          />

          {/* Elektro */}
          <GewerkSection
            label="Elektro" icon={<Zap size={10} />}
            accentColor="#34d399" accentBg="rgba(52,211,153,0.15)"
            items={elektro} collapsed={elektroCollapsed} sidebarCollapsed={sidebarCollapsed}
            currentPath={location.pathname} onNavigate={id => navigate(`/baustellen/liste/${id}`)}
            onToggle={toggleElektro} sidebarWidth={sidebarWidth}
          />

          {/* Werkzeuge */}
          {!sidebarCollapsed && (
            <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: 'rgba(255,255,255,0.2)', fontWeight: 600, padding: '8px 8px 4px', margin: '4px 0 0', whiteSpace: 'nowrap' }}>Werkzeuge</p>
          )}
          {NAV.slice(1).map(({ to, icon: Icon, label }) => {
            const active = location.pathname === to || location.pathname.startsWith(to + '/');
            return (
              <NavLink key={to} to={to} className={`nav-item ${active ? 'active' : ''}`}
                style={{ display: 'flex', alignItems: 'center', gap: sidebarCollapsed ? 0 : 10, padding: sidebarCollapsed ? '10px 0' : '8px 12px', justifyContent: sidebarCollapsed ? 'center' : 'flex-start', borderRadius: 10, textDecoration: 'none', fontSize: 13, fontWeight: 500, color: active ? '#fff' : 'rgba(255,255,255,0.45)', borderLeft: active ? `3px solid ${ACCENT}` : '3px solid transparent', position: 'relative', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                <Icon size={15} style={{ flexShrink: 0 }} />
                {!sidebarCollapsed && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>}
                {sidebarCollapsed && active && (
                  <div style={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', width: 3, height: 20, background: ACCENT, borderRadius: '3px 0 0 3px' }} />
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Bottom */}
        <div style={{ padding: '8px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
          <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)} className="collapse-btn"
            style={{ display: 'flex', alignItems: 'center', gap: sidebarCollapsed ? 0 : 8, justifyContent: sidebarCollapsed ? 'center' : 'flex-start', width: '100%', padding: sidebarCollapsed ? '10px 0' : '8px 12px', background: 'none', border: 'none', borderRadius: 10, color: 'rgba(255,255,255,0.35)', fontSize: 12, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden' }}>
            {sidebarCollapsed ? <ChevronRight size={14} /> : <><ChevronLeft size={14} /><span style={{ marginLeft: 8 }}>Einklappen</span></>}
          </button>
          <button onClick={signOut} className="collapse-btn"
            style={{ display: 'flex', alignItems: 'center', gap: sidebarCollapsed ? 0 : 8, justifyContent: sidebarCollapsed ? 'center' : 'flex-start', width: '100%', padding: sidebarCollapsed ? '10px 0' : '8px 12px', background: 'none', border: 'none', borderRadius: 10, color: 'rgba(255,255,255,0.3)', fontSize: 12, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#fca5a5'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.3)'; }}>
            <LogOut size={14} style={{ flexShrink: 0 }} />
            {!sidebarCollapsed && <span style={{ marginLeft: 8 }}>Abmelden</span>}
          </button>
        </div>

        {/* Resize Handle — rechter Rand der Sidebar */}
        {!sidebarCollapsed && (
          <div
            onMouseDown={startResize}
            className="resize-handle"
            title="Sidebar-Breite anpassen"
            style={{
              position: 'absolute', top: 0, right: 0, bottom: 0,
              width: 5, cursor: 'col-resize',
              background: isResizing ? 'rgba(37,99,235,0.5)' : 'transparent',
              transition: 'background .15s',
              zIndex: 20,
            }}
          />
        )}
      </aside>

      {/* Main */}
      <main style={{ flex: 1, overflowY: 'auto', padding: '28px 32px', minWidth: 0 }}>
        {children}
      </main>
    </div>
  );
}
