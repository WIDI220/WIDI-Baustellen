import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { LayoutDashboard, HardHat, Clock, Package, FileText, Camera, AlertTriangle, LogOut, ChevronLeft, ChevronRight, FileUp } from 'lucide-react';

const NAV = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/baustellen', icon: HardHat, label: 'Baustellen' },
  { to: '/zeiterfassung', icon: Clock, label: 'Zeiterfassung' },
  { to: '/material', icon: Package, label: 'Material' },
  { to: '/nachtraege', icon: FileText, label: 'Nachträge' },
  { to: '/fotos', icon: Camera, label: 'Fotos' },
  { to: '/eskalationen', icon: AlertTriangle, label: 'Eskalationen' },
  { to: '/import', icon: FileUp, label: 'Auftrag importieren' },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { signOut } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  return (
    <div className="flex h-screen overflow-hidden bg-[#f0f2f5]">
      {/* Sidebar */}
      <aside className={`${collapsed ? 'w-16' : 'w-56'} bg-[#1a3356] flex flex-col transition-all duration-300 flex-shrink-0`}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-5 border-b border-white/10">
          <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
            <HardHat className="h-4 w-4 text-white" />
          </div>
          {!collapsed && <div><p className="text-white font-bold text-sm leading-none">WIDI</p><p className="text-white/50 text-[10px] mt-0.5">Baustellen</p></div>}
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
          {NAV.map(({ to, icon: Icon, label }) => {
            const active = location.pathname === to || location.pathname.startsWith(to + '/');
            return (
              <NavLink key={to} to={to} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm ${active ? 'bg-white/15 text-white font-medium' : 'text-white/60 hover:bg-white/8 hover:text-white'}`}>
                <Icon className="h-4 w-4 flex-shrink-0" />
                {!collapsed && <span className="truncate">{label}</span>}
              </NavLink>
            );
          })}
        </nav>

        {/* Bottom */}
        <div className="p-2 border-t border-white/10 space-y-1">
          <button onClick={() => setCollapsed(!collapsed)} className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-white/50 hover:text-white hover:bg-white/10 transition-all text-sm">
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <><ChevronLeft className="h-4 w-4" /><span>Einklappen</span></>}
          </button>
          <button onClick={signOut} className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-white/50 hover:text-red-300 hover:bg-white/10 transition-all text-sm">
            <LogOut className="h-4 w-4 flex-shrink-0" />
            {!collapsed && <span>Abmelden</span>}
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
