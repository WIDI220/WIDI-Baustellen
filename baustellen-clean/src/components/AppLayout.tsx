import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { LayoutDashboard, HardHat, Clock, Package, FileText, Camera, AlertTriangle, LogOut, ChevronLeft, ChevronRight, FileUp, Users, Building2 } from 'lucide-react';

const NAV = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/baustellen', icon: HardHat, label: 'Baustellen' },
  { to: '/zeiterfassung', icon: Clock, label: 'Zeiterfassung' },
  { to: '/material', icon: Package, label: 'Material' },
  { to: '/nachtraege', icon: FileText, label: 'Nachträge' },
  { to: '/fotos', icon: Camera, label: 'Fotos' },
  { to: '/eskalationen', icon: AlertTriangle, label: 'Eskalationen' },
  { to: '/mitarbeiter', icon: Users, label: 'Mitarbeiter' },
  { to: '/import', icon: FileUp, label: 'Import' },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { signOut } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  return (
    <div className="flex h-screen overflow-hidden" style={{background:'#f4f6fa'}}>
      {/* Sidebar */}
      <aside className={`${collapsed ? 'w-[60px]' : 'w-[220px]'} flex flex-col flex-shrink-0 transition-all duration-300 ease-in-out`}
        style={{background:'linear-gradient(180deg, #0d1d3a 0%, #142c52 100%)', borderRight:'1px solid rgba(255,255,255,.06)'}}>

        {/* Logo */}
        <div className={`flex items-center gap-3 px-4 py-5 ${collapsed ? 'justify-center' : ''}`}
          style={{borderBottom:'1px solid rgba(255,255,255,.07)'}}>
          <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{background:'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)', boxShadow:'0 2px 8px rgba(59,130,246,.4)'}}>
            <Building2 className="h-4 w-4 text-white" />
          </div>
          {!collapsed && (
            <div>
              <p className="text-white font-bold text-sm leading-none tracking-wide">WIDI</p>
              <p className="text-xs mt-0.5 font-medium" style={{color:'rgba(255,255,255,.35)', letterSpacing:'.05em'}}>BAUSTELLEN</p>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
          {NAV.map(({ to, icon: Icon, label }) => {
            const active = location.pathname === to || location.pathname.startsWith(to + '/');
            return (
              <NavLink key={to} to={to}
                className={`flex items-center gap-3 rounded-xl transition-all text-sm font-medium
                  ${collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5'}
                  ${active
                    ? 'nav-active text-white'
                    : 'hover:text-white'
                  }`}
                style={active
                  ? {background:'rgba(59,130,246,.18)', color:'#93c5fd'}
                  : {color:'rgba(255,255,255,.45)'}
                }
                title={collapsed ? label : undefined}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                {!collapsed && <span className="truncate">{label}</span>}
              </NavLink>
            );
          })}
        </nav>

        {/* Bottom */}
        <div className="p-2 space-y-1" style={{borderTop:'1px solid rgba(255,255,255,.07)'}}>
          <button onClick={() => setCollapsed(!collapsed)}
            className={`w-full flex items-center gap-3 rounded-xl py-2 transition-all text-sm
              ${collapsed ? 'justify-center px-0' : 'px-3'}`}
            style={{color:'rgba(255,255,255,.35)'}}
            onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,.7)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,.35)')}>
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <><ChevronLeft className="h-4 w-4" /><span>Einklappen</span></>}
          </button>
          <button onClick={signOut}
            className={`w-full flex items-center gap-3 rounded-xl py-2 transition-all text-sm
              ${collapsed ? 'justify-center px-0' : 'px-3'}`}
            style={{color:'rgba(255,255,255,.35)'}}
            onMouseEnter={e => (e.currentTarget.style.color = '#fca5a5')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,.35)')}>
            <LogOut className="h-4 w-4 flex-shrink-0" />
            {!collapsed && <span>Abmelden</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
